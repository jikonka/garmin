#!/usr/bin/env python3
"""
Garmin Connect CN Workout Pusher
将训练计划通过 API 直接写入 Garmin Connect 日历

使用方法：
1. 在浏览器 DevTools Network 里抓取任意一个 workout 请求的 Cookie
2. 运行: python3 garmin_push_workouts.py --cookie "YOUR_COOKIE" --jwt "YOUR_JWT"

需要的 headers（从 Chrome DevTools 复制）:
- Cookie: session=... SESSIONID=... JWT_WEB=...
- JWT token 单独提取出来
"""

import json
import urllib.request
import urllib.parse
import argparse
import sys
from datetime import datetime, timedelta

# ─────────────────────────────────────────
# Garmin Connect CN API
# ─────────────────────────────────────────
BASE_URL = "https://connect.garmin.cn/gc-api/workout-service"
OWNER_ID = 10264941       # 从抓包获取
TRAINING_PLAN_ID = 859511  # Sprint Triathlon 计划 ID

SPORT_TYPES = {
    "swimming": {"sportTypeId": 4, "sportTypeKey": "swimming", "displayOrder": 3},
    "running":  {"sportTypeId": 1, "sportTypeKey": "running",  "displayOrder": 1},
    "cycling":  {"sportTypeId": 2, "sportTypeKey": "cycling",  "displayOrder": 2},
}

STEP_TYPES = {
    "warmup":   {"stepTypeId": 1, "stepTypeKey": "warmup",   "displayOrder": 1},
    "cooldown": {"stepTypeId": 2, "stepTypeKey": "cooldown", "displayOrder": 2},
    "interval": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
    "rest":     {"stepTypeId": 5, "stepTypeKey": "rest",     "displayOrder": 5},
    "repeat":   {"stepTypeId": 6, "stepTypeKey": "repeat",   "displayOrder": 6},
    "active":   {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
}

END_CONDITIONS = {
    "lap_button": {"conditionTypeId": 1, "conditionTypeKey": "lap.button",  "displayOrder": 1, "displayable": True},
    "distance":   {"conditionTypeId": 3, "conditionTypeKey": "distance",    "displayOrder": 3, "displayable": True},
    "time":       {"conditionTypeId": 2, "conditionTypeKey": "time",        "displayOrder": 2, "displayable": True},
    "iterations": {"conditionTypeId": 7, "conditionTypeKey": "iterations",  "displayOrder": 7, "displayable": False},
    "fixed_rest": {"conditionTypeId": 8, "conditionTypeKey": "fixed.rest",  "displayOrder": 8, "displayable": True},
}

TARGET_TYPES = {
    "none":       {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target",   "displayOrder": 1},
    "heart_rate": {"workoutTargetTypeId": 4, "workoutTargetTypeKey": "heart.rate",  "displayOrder": 4},
}

STROKE_TYPES = {
    "free":   {"strokeTypeId": 6, "strokeTypeKey": "free",       "displayOrder": 6},
    "drill":  {"strokeTypeId": 5, "strokeTypeKey": "drill",      "displayOrder": 5},
    "mixed":  {"strokeTypeId": 8, "strokeTypeKey": "mixed",      "displayOrder": 8},
    "any":    {"strokeTypeId": 1, "strokeTypeKey": "any_stroke", "displayOrder": 1},
    "none":   {},
}

EQUIPMENT_TYPES = {
    "kickboard": {"equipmentTypeId": 2, "equipmentTypeKey": "kickboard",  "displayOrder": 2},
    "pull_buoy": {"equipmentTypeId": 4, "equipmentTypeKey": "pull_buoy",  "displayOrder": 4},
    "none":      {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
}

# HR zones (HRmax=186)
HR_ZONES = {
    1: (None, 113),   # Z1 < 114
    2: (114, 132),    # Z2
    3: (133, 150),    # Z3
    4: (151, 165),    # Z4
    5: (166, None),   # Z5
}

_step_id_counter = [1000000]

def next_step_id():
    _step_id_counter[0] += 1
    return _step_id_counter[0]

# ─────────────────────────────────────────
# Step builders
# ─────────────────────────────────────────

def swim_step(step_type, distance_m, stroke="free", equipment="none",
              rest_s=None, description=None, child_step_id=None):
    """游泳距离步骤"""
    steps = []
    sid = next_step_id()
    step = {
        "type": "ExecutableStepDTO",
        "stepId": sid,
        "stepOrder": 0,  # 后面重排
        "stepType": STEP_TYPES[step_type],
        "childStepId": child_step_id,
        "description": description,
        "endCondition": END_CONDITIONS["distance"],
        "endConditionValue": distance_m,
        "preferredEndConditionUnit": {"unitKey": "meter"},
        "endConditionCompare": None,
        "targetType": TARGET_TYPES["none"],
        "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
        "zoneNumber": None,
        "secondaryTargetType": None, "secondaryTargetValueOne": None,
        "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
        "secondaryZoneNumber": None, "endConditionZone": None,
        "strokeType": STROKE_TYPES.get(stroke, {}),
        "equipmentType": EQUIPMENT_TYPES.get(equipment, EQUIPMENT_TYPES["none"]),
        "category": None, "exerciseName": None,
        "workoutProvider": None, "providerExerciseSourceId": None,
        "weightValue": None, "weightUnit": None,
    }
    steps.append(step)

    if rest_s is not None:
        rsid = next_step_id()
        rest = {
            "type": "ExecutableStepDTO",
            "stepId": rsid,
            "stepOrder": 0,
            "stepType": STEP_TYPES["rest"],
            "childStepId": child_step_id,
            "description": None,
            "endCondition": END_CONDITIONS["fixed_rest"],
            "endConditionValue": rest_s,
            "preferredEndConditionUnit": None,
            "endConditionCompare": None,
            "targetType": TARGET_TYPES["none"],
            "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
            "zoneNumber": None,
            "secondaryTargetType": None, "secondaryTargetValueOne": None,
            "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
            "secondaryZoneNumber": None, "endConditionZone": None,
            "strokeType": {},
            "equipmentType": EQUIPMENT_TYPES["none"],
            "category": None, "exerciseName": None,
            "workoutProvider": None, "providerExerciseSourceId": None,
            "weightValue": None, "weightUnit": None,
        }
        steps.append(rest)
    return steps


def lap_rest_step():
    """lap button 休息（分组间隔用）"""
    return {
        "type": "ExecutableStepDTO",
        "stepId": next_step_id(),
        "stepOrder": 0,
        "stepType": STEP_TYPES["rest"],
        "childStepId": None,
        "description": None,
        "endCondition": END_CONDITIONS["lap_button"],
        "endConditionValue": None,
        "preferredEndConditionUnit": None,
        "endConditionCompare": None,
        "targetType": TARGET_TYPES["none"],
        "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
        "zoneNumber": None,
        "secondaryTargetType": None, "secondaryTargetValueOne": None,
        "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
        "secondaryZoneNumber": None, "endConditionZone": None,
        "strokeType": {},
        "equipmentType": EQUIPMENT_TYPES["none"],
        "category": None, "exerciseName": None,
        "workoutProvider": None, "providerExerciseSourceId": None,
        "weightValue": None, "weightUnit": None,
    }


def repeat_group(inner_steps, iterations, child_step_id):
    """重复组"""
    return {
        "type": "RepeatGroupDTO",
        "stepId": next_step_id(),
        "stepOrder": 0,
        "stepType": STEP_TYPES["repeat"],
        "childStepId": child_step_id,
        "numberOfIterations": iterations,
        "workoutSteps": inner_steps,
        "endConditionValue": iterations,
        "preferredEndConditionUnit": None,
        "endConditionCompare": None,
        "endCondition": END_CONDITIONS["iterations"],
        "skipLastRestStep": False,
        "smartRepeat": False,
    }


def run_time_step(step_type, duration_s, hr_zone=None, description=None):
    """跑步/骑行时间步骤"""
    target = TARGET_TYPES["none"]
    t_low, t_high, z_num = None, None, None
    if hr_zone and hr_zone in HR_ZONES:
        target = TARGET_TYPES["heart_rate"]
        t_low, t_high = HR_ZONES[hr_zone]
        z_num = hr_zone

    return {
        "type": "ExecutableStepDTO",
        "stepId": next_step_id(),
        "stepOrder": 0,
        "stepType": STEP_TYPES[step_type],
        "childStepId": None,
        "description": description,
        "endCondition": END_CONDITIONS["time"],
        "endConditionValue": duration_s,
        "preferredEndConditionUnit": {"unitKey": "second"},
        "endConditionCompare": None,
        "targetType": target,
        "targetValueOne": t_low,
        "targetValueTwo": t_high,
        "targetValueUnit": {"unitKey": "bpm"} if hr_zone else None,
        "zoneNumber": z_num,
        "secondaryTargetType": None, "secondaryTargetValueOne": None,
        "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
        "secondaryZoneNumber": None, "endConditionZone": None,
        "strokeType": None, "equipmentType": None,
        "category": None, "exerciseName": None,
        "workoutProvider": None, "providerExerciseSourceId": None,
        "weightValue": None, "weightUnit": None,
    }


def run_dist_step(step_type, distance_m, hr_zone=None, description=None):
    """跑步/骑行距离步骤"""
    target = TARGET_TYPES["none"]
    t_low, t_high, z_num = None, None, None
    if hr_zone and hr_zone in HR_ZONES:
        target = TARGET_TYPES["heart_rate"]
        t_low, t_high = HR_ZONES[hr_zone]
        z_num = hr_zone

    return {
        "type": "ExecutableStepDTO",
        "stepId": next_step_id(),
        "stepOrder": 0,
        "stepType": STEP_TYPES[step_type],
        "childStepId": None,
        "description": description,
        "endCondition": END_CONDITIONS["distance"],
        "endConditionValue": distance_m,
        "preferredEndConditionUnit": {"unitKey": "meter"},
        "endConditionCompare": None,
        "targetType": target,
        "targetValueOne": t_low,
        "targetValueTwo": t_high,
        "targetValueUnit": {"unitKey": "bpm"} if hr_zone else None,
        "zoneNumber": z_num,
        "secondaryTargetType": None, "secondaryTargetValueOne": None,
        "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
        "secondaryZoneNumber": None, "endConditionZone": None,
        "strokeType": None, "equipmentType": None,
        "category": None, "exerciseName": None,
        "workoutProvider": None, "providerExerciseSourceId": None,
        "weightValue": None, "weightUnit": None,
    }


def open_step(step_type, description=None):
    """开放式步骤（无目标）"""
    return {
        "type": "ExecutableStepDTO",
        "stepId": next_step_id(),
        "stepOrder": 0,
        "stepType": STEP_TYPES[step_type],
        "childStepId": None,
        "description": description,
        "endCondition": END_CONDITIONS["lap_button"],
        "endConditionValue": None,
        "preferredEndConditionUnit": None,
        "endConditionCompare": None,
        "targetType": TARGET_TYPES["none"],
        "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
        "zoneNumber": None,
        "secondaryTargetType": None, "secondaryTargetValueOne": None,
        "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
        "secondaryZoneNumber": None, "endConditionZone": None,
        "strokeType": None, "equipmentType": None,
        "category": None, "exerciseName": None,
        "workoutProvider": None, "providerExerciseSourceId": None,
        "weightValue": None, "weightUnit": None,
    }


def assign_step_orders(steps, start=1):
    """递归分配 stepOrder"""
    order = start
    for s in steps:
        s["stepOrder"] = order
        order += 1
        if s.get("type") == "RepeatGroupDTO":
            order = assign_step_orders(s["workoutSteps"], order)
    return order


def make_workout(name, description, sport_key, steps,
                 estimated_distance_m=None, pool_length=None):
    """组装完整 workout JSON"""
    assign_step_orders(steps, 1)
    sport = SPORT_TYPES[sport_key]
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S.0")

    wkt = {
        "workoutId": None,  # 新建时为 None
        "ownerId": OWNER_ID,
        "workoutName": name,
        "description": description,
        "updatedDate": now,
        "createdDate": now,
        "sportType": sport,
        "subSportType": None,
        "trainingPlanId": TRAINING_PLAN_ID,
        "author": {
            "userProfilePk": OWNER_ID,
            "displayName": None,
            "fullName": "Zikun",
        },
        "sharedWithUsers": None,
        "estimatedDurationInSecs": 0,
        "estimatedDistanceInMeters": estimated_distance_m or 0,
        "workoutSegments": [{
            "segmentOrder": 1,
            "sportType": sport,
            "poolLengthUnit": {"unitId": 1, "unitKey": "meter", "factor": 100} if pool_length else None,
            "poolLength": pool_length,
            "avgTrainingSpeed": None,
            "estimatedDurationInSecs": None,
            "estimatedDistanceInMeters": None,
            "estimatedDistanceUnit": None,
            "estimateType": None,
            "description": None,
            "workoutSteps": steps,
        }],
        "poolLength": pool_length,
        "poolLengthUnit": {"unitId": 1, "unitKey": "meter", "factor": 100} if pool_length else None,
        "locale": None,
        "workoutProvider": "Garmin",
        "workoutSourceId": None,
        "uploadTimestamp": None,
        "atpPlanId": None,
        "consumer": None,
        "consumerName": None,
        "consumerImageURL": None,
        "consumerWebsiteURL": None,
        "avgTrainingSpeed": 0,
        "estimateType": "TIME_ESTIMATED",
        "estimatedDistanceUnit": {"unitKey": None},
        "workoutThumbnailUrl": None,
        "isSessionTransitionEnabled": None,
        "shared": False,
        "isWheelchair": False,
    }
    return wkt


# ─────────────────────────────────────────
# Week 2 Workouts
# ─────────────────────────────────────────

def workout_2026_03_17():
    """Tue — 游泳主课 W2：单臂+转体"""
    steps = []
    # 热身 200m mixed
    steps += swim_step("warmup", 200, stroke="mixed", description="放松自由泳或仰泳，感受水感")
    steps.append(lap_rest_step())
    # 6×25m drill（单臂）
    inner = swim_step("interval", 25, stroke="drill", rest_s=25,
                      description="单臂划水：一臂伸直，单侧划水，感受转体带动手臂", child_step_id=1)
    steps.append(repeat_group(inner, 6, child_step_id=1))
    steps.append(lap_rest_step())
    # 4×150m freestyle
    inner2 = swim_step("interval", 150, stroke="free", rest_s=25,
                       description="自由泳Z2，将单臂练习中感受融入完整泳姿", child_step_id=2)
    steps.append(repeat_group(inner2, 4, child_step_id=2))
    steps.append(lap_rest_step())
    # 放松 200m
    steps += swim_step("cooldown", 200, stroke="mixed", description="轻松游，整理")
    return make_workout(
        "W02D2 - 游泳主课·单臂转体",
        "W2主题：单臂划水进阶。热身200m→6×25m单臂drill(休25s)→4×150m自由泳(休25s)→放松200m。重点：不是手臂划水，是髋部旋转带动手臂入水。",
        "swimming", steps, estimated_distance_m=1450, pool_length=25
    )


def workout_2026_03_18():
    """Wed — 间歇跑 5×1000m Z4"""
    steps = []
    steps.append(run_time_step("warmup", 600, hr_zone=2, description="Z2慢跑热身，步频170+"))
    # 5×(1000m Z4 + 2min Z2恢复)
    inner = [
        run_dist_step("interval", 1000, hr_zone=4, description="Z4强度，感觉吃力但可维持"),
        run_time_step("rest", 120, hr_zone=2, description="Z2慢跑恢复，不要走路"),
    ]
    # assign child_step_id
    for s in inner: s["childStepId"] = 1
    steps.append(repeat_group(inner, 5, child_step_id=1))
    steps.append(run_time_step("active", 600, hr_zone=2, description="Z2放松慢跑"))
    steps.append(open_step("cooldown", description="步行放松，拉伸"))
    return make_workout(
        "W02D3 - 间歇跑 5×1000m",
        "热身10min Z2 → 5×1000m Z4（间歇2min Z2慢跑）→ 放松10min Z2。比W1的800m加长，间歇段心率控制Z4(151-165)，不要冲Z5。高步频小步幅。",
        "running", steps
    )


def workout_2026_03_19():
    """Thu — 游泳恢复课 W2：单臂巩固"""
    steps = []
    steps += swim_step("warmup", 150, stroke="mixed", description="轻松热身")
    steps.append(lap_rest_step())
    # 4×25m drill
    inner = swim_step("interval", 25, stroke="drill", rest_s=15,
                      description="慢速单臂，感受肘部高位入水", child_step_id=1)
    steps.append(repeat_group(inner, 4, child_step_id=1))
    steps.append(lap_rest_step())
    # 350m freestyle 轻松
    steps += swim_step("active", 350, stroke="free", description="自由泳Z2，将本周技术融入完整泳姿")
    steps.append(lap_rest_step())
    steps += swim_step("cooldown", 100, stroke="mixed", description="放松整理")
    return make_workout(
        "W02D4 - 游泳恢复·技术巩固",
        "W2技术复习：单臂+转体巩固。热身150m→4×25m单臂drill(休15s)→350m自由泳→放松100m。轻量课，感受髋带肩的转体节奏。",
        "swimming", steps, estimated_distance_m=625, pool_length=25
    )


def workout_2026_03_20():
    """Fri — 节奏跑 45min"""
    steps = []
    steps.append(open_step("warmup", description="步行+慢跑，激活身体"))
    steps.append(run_time_step("active", 600, hr_zone=1, description="Z1超轻松慢跑热身"))
    steps.append(run_time_step("active", 300, hr_zone=2, description="Z2过渡，逐步提速"))
    steps.append(run_time_step("interval", 1500, hr_zone=3, description="Z3节奏跑，控制133-142，高步频小步幅"))
    steps.append(run_time_step("active", 300, hr_zone=1, description="Z1降心率"))
    steps.append(open_step("cooldown", description="步行放松，拉伸小腿"))
    return make_workout(
        "W02D5 - 节奏跑 45min",
        "热身open→Z1 10min→Z2 5min→Z3节奏跑25min(133-142)→Z1 5min→放松。上周无热身直接进入节奏段，本周必须完成Z1→Z2递进热身。",
        "running", steps
    )


def workout_2026_03_21_bike():
    """Sat — Brick骑行 80min"""
    steps = []
    steps.append(run_time_step("warmup", 300, hr_zone=1, description="Z1热身，踏频80+"))
    steps.append(run_time_step("active", 1200, hr_zone=2, description="Z2有氧，踏频85-90，控制在114-132"))
    steps.append(run_time_step("interval", 2400, hr_zone=3, description="Z3主体，踏频85+，HR 133-150"))
    steps.append(run_time_step("active", 900, hr_zone=2, description="Z2降温，逐渐降低强度"))
    steps.append(open_step("cooldown", description="骑行完立即换跑鞋，不超过2min"))
    return make_workout(
        "W02D6a - Brick骑行 80min",
        "骑行80min：Z1热身5min→Z2 20min→Z3主体40min→Z2降温15min。骑行结束立即换跑鞋不停歇，体验腿部转换感。",
        "cycling", steps
    )


def workout_2026_03_21_run():
    """Sat — Brick跑 25min"""
    steps = []
    steps.append(run_time_step("active", 900, hr_zone=3, description="Z3前段，腿发沉是正常Brick效应，5-8min消失"))
    steps.append(run_time_step("interval", 600, hr_zone=4, description="Z4提速后段，感受换项后身体的调整"))
    steps.append(open_step("cooldown", description="慢跑步行放松，拉伸股四头肌"))
    return make_workout(
        "W02D6b - Brick跑 25min",
        "Brick跑25min：Z3 15min适应换项→Z4 10min提速。腿发沉是正常现象，不要因此放弃速度，5-8min后消失。",
        "running", steps
    )


def workout_2026_03_22():
    """Sun — 长骑 85min Z2"""
    steps = []
    steps.append(run_time_step("warmup", 300, hr_zone=1, description="Z1超轻松热身"))
    steps.append(run_time_step("active", 3600, hr_zone=2, description="Z2有氧主体，踏频≥80rpm，avg HR不超过135"))
    steps.append(run_time_step("active", 1200, hr_zone=3, description="Z3提升段，感受踏频与功率的关系"))
    steps.append(open_step("cooldown", description="放松踩踏，整理拉伸"))
    return make_workout(
        "W02D7 - 长骑 85min",
        "长骑85min：Z1热身5min→Z2有氧60min(踏频≥80)→Z3提升20min→放松。周六Brick后腿有积累，全程avg HR不超过135。",
        "cycling", steps
    )


# ─────────────────────────────────────────
# API 调用
# ─────────────────────────────────────────

def get_headers(cookie, jwt_token):
    return {
        "Content-Type": "application/json;charset=utf-8",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://connect.garmin.cn",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        "X-app-ver": "5.22.0.21b",
        "NK": "NT",
        "X-lang": "zh-CN",
        "Cookie": cookie,
        "Authorization": f"Bearer {jwt_token}" if jwt_token else "",
    }


def create_workout(workout_data, headers):
    """POST 创建新 workout，返回 workoutId"""
    url = f"{BASE_URL}/workout"
    data = json.dumps(workout_data).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            return result.get("workoutId")
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code}: {e.read().decode()[:200]}")
        return None


def schedule_workout(workout_id, date_str, headers):
    """POST 把 workout 安排到指定日期"""
    url = f"{BASE_URL}/schedule/{workout_id}"
    data = json.dumps({"date": date_str}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return True
    except urllib.error.HTTPError as e:
        print(f"  SCHEDULE ERROR {e.code}: {e.read().decode()[:200]}")
        return False


def list_scheduled_workouts(headers, start_date, end_date):
    """获取日期范围内的已排期 workout"""
    url = f"{BASE_URL}/workouts/scheduled/{start_date}/{end_date}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  LIST ERROR: {e}")
        return []


# ─────────────────────────────────────────
# Main
# ─────────────────────────────────────────

WEEK2_WORKOUTS = [
    ("2026-03-17", workout_2026_03_17),
    ("2026-03-18", workout_2026_03_18),
    ("2026-03-19", workout_2026_03_19),
    ("2026-03-20", workout_2026_03_20),
    ("2026-03-21", workout_2026_03_21_bike),
    ("2026-03-21", workout_2026_03_21_run),  # Brick run，同日第二个
    ("2026-03-22", workout_2026_03_22),
]


def main():
    parser = argparse.ArgumentParser(description="Push Week 2 workouts to Garmin Connect CN")
    parser.add_argument("--cookie", required=True,
                        help="Cookie header value (从 Chrome DevTools 复制)")
    parser.add_argument("--jwt", default="",
                        help="JWT_WEB token value（可选）")
    parser.add_argument("--dry-run", action="store_true",
                        help="只生成 JSON，不实际发送")
    args = parser.parse_args()

    headers = get_headers(args.cookie, args.jwt)

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Pushing Week 2 workouts to Garmin Connect CN...\n")

    for date_str, wkt_fn in WEEK2_WORKOUTS:
        wkt = wkt_fn()
        name = wkt["workoutName"]
        print(f"  {date_str} — {name}")

        if args.dry_run:
            print(f"    JSON size: {len(json.dumps(wkt))} bytes ✓")
            continue

        # 1. 创建 workout
        workout_id = create_workout(wkt, headers)
        if not workout_id:
            print(f"    ✗ 创建失败")
            continue
        print(f"    ✓ 创建成功 workoutId={workout_id}")

        # 2. 排期
        ok = schedule_workout(workout_id, date_str, headers)
        if ok:
            print(f"    ✓ 排期到 {date_str}")
        else:
            print(f"    ✗ 排期失败（workout 已创建，可手动排期）")

    print("\n完成！打开 Garmin Connect → 训练计划 查看。")


if __name__ == "__main__":
    main()
