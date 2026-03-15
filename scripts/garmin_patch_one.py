#!/usr/bin/env python3
"""
Garmin Connect CN — 单条 Workout 覆盖测试
只修改 2026-03-17（周二）的游泳训练，验证 API 可行性。

用法：
  python3 garmin_patch_one.py --cookie "..." --jwt "..."
  python3 garmin_patch_one.py --cookie "..." --jwt "..." --dry-run   # 只打印，不发送
  python3 garmin_patch_one.py --cookie "..." --jwt "..." --restore   # 从备份还原

备份文件：garmin_backup_20260317.json（运行后自动生成）
"""

import json
import urllib.request
import urllib.error
import argparse
import sys
import os
from datetime import datetime

BASE_URL = "https://connect.garmin.cn/gc-api/workout-service"

# ─────────────────────────────────────────
# 第一步：找到 2026-03-17 的 workout ID
# ─────────────────────────────────────────

def get_scheduled_workouts(headers, start="2026-03-17", end="2026-03-17"):
    """拉取指定日期范围内的已排期 workouts"""
    url = f"{BASE_URL}/workouts/scheduled/{start}/{end}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            return data
    except urllib.error.HTTPError as e:
        print(f"ERROR {e.code}: {e.read().decode()[:300]}")
        return None


def get_workout_detail(workout_id, headers):
    """拉取单条 workout 完整数据"""
    url = f"{BASE_URL}/workout/{workout_id}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"ERROR {e.code}: {e.read().decode()[:300]}")
        return None


def put_workout(workout_id, workout_data, headers):
    """PUT 覆盖 workout"""
    url = f"{BASE_URL}/workout/{workout_id}"
    data = json.dumps(workout_data).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="PUT")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()), None
    except urllib.error.HTTPError as e:
        return None, f"{e.code}: {e.read().decode()[:300]}"


# ─────────────────────────────────────────
# 新训练内容：W2 Tue 游泳主课·单臂转体
# ─────────────────────────────────────────

def build_new_swim_workout(existing):
    """
    基于现有 workout 结构，只替换关键字段。
    保留：workoutId, ownerId, trainingPlanId, author, createdDate 等元数据
    替换：workoutName, description, workoutSegments(steps)
    """
    # 深拷贝原始数据作为基础
    new = json.loads(json.dumps(existing))

    new["workoutName"] = "W02D2 - 游泳主课·单臂转体"
    new["description"] = (
        "W2主题：单臂划水进阶。"
        "热身200m→6×25m单臂drill(休25s)→4×150m自由泳(休25s)→放松200m。"
        "重点：不是手臂划水，是髋部旋转带动手臂入水。"
    )
    new["updatedDate"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S.0")
    new["estimatedDistanceInMeters"] = 1450
    new["poolLength"] = 25
    new["poolLengthUnit"] = {"unitId": 1, "unitKey": "meter", "factor": 100}

    # 步骤定义
    steps = [
        # 热身 200m mixed
        {
            "type": "ExecutableStepDTO",
            "stepId": None,  # 新建 step 传 None，Garmin 服务端分配
            "stepOrder": 1,
            "stepType": {"stepTypeId": 1, "stepTypeKey": "warmup", "displayOrder": 1},
            "childStepId": None,
            "description": "放松自由泳或仰泳，感受水感，不追速度",
            "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance", "displayOrder": 3, "displayable": True},
            "endConditionValue": 200,
            "preferredEndConditionUnit": {"unitKey": "meter"},
            "endConditionCompare": None,
            "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
            "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
            "zoneNumber": None,
            "secondaryTargetType": None, "secondaryTargetValueOne": None,
            "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
            "secondaryZoneNumber": None, "endConditionZone": None,
            "strokeType": {"strokeTypeId": 8, "strokeTypeKey": "mixed", "displayOrder": 8},
            "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
            "category": None, "exerciseName": None,
            "workoutProvider": None, "providerExerciseSourceId": None,
            "weightValue": None, "weightUnit": None,
        },
        # lap button 休息
        {
            "type": "ExecutableStepDTO",
            "stepId": None,
            "stepOrder": 2,
            "stepType": {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5},
            "childStepId": None,
            "description": None,
            "endCondition": {"conditionTypeId": 1, "conditionTypeKey": "lap.button", "displayOrder": 1, "displayable": True},
            "endConditionValue": None,
            "preferredEndConditionUnit": None,
            "endConditionCompare": None,
            "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
            "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
            "zoneNumber": None,
            "secondaryTargetType": None, "secondaryTargetValueOne": None,
            "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
            "secondaryZoneNumber": None, "endConditionZone": None,
            "strokeType": {},
            "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
            "category": None, "exerciseName": None,
            "workoutProvider": None, "providerExerciseSourceId": None,
            "weightValue": None, "weightUnit": None,
        },
        # REPEAT x6: 25m drill + 25s rest
        {
            "type": "RepeatGroupDTO",
            "stepId": None,
            "stepOrder": 3,
            "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
            "childStepId": 1,
            "numberOfIterations": 6,
            "workoutSteps": [
                {
                    "type": "ExecutableStepDTO",
                    "stepId": None,
                    "stepOrder": 4,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
                    "childStepId": 1,
                    "description": "单臂划水：一臂前伸，单侧划水，感受髋部旋转带动手臂入水",
                    "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance", "displayOrder": 3, "displayable": True},
                    "endConditionValue": 25,
                    "preferredEndConditionUnit": {"unitKey": "meter"},
                    "endConditionCompare": None,
                    "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                    "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
                    "zoneNumber": None,
                    "secondaryTargetType": None, "secondaryTargetValueOne": None,
                    "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
                    "secondaryZoneNumber": None, "endConditionZone": None,
                    "strokeType": {"strokeTypeId": 5, "strokeTypeKey": "drill", "displayOrder": 5},
                    "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
                    "category": None, "exerciseName": None,
                    "workoutProvider": None, "providerExerciseSourceId": None,
                    "weightValue": None, "weightUnit": None,
                },
                {
                    "type": "ExecutableStepDTO",
                    "stepId": None,
                    "stepOrder": 5,
                    "stepType": {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5},
                    "childStepId": 1,
                    "description": None,
                    "endCondition": {"conditionTypeId": 8, "conditionTypeKey": "fixed.rest", "displayOrder": 8, "displayable": True},
                    "endConditionValue": 25,
                    "preferredEndConditionUnit": None,
                    "endConditionCompare": None,
                    "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                    "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
                    "zoneNumber": None,
                    "secondaryTargetType": None, "secondaryTargetValueOne": None,
                    "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
                    "secondaryZoneNumber": None, "endConditionZone": None,
                    "strokeType": {},
                    "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
                    "category": None, "exerciseName": None,
                    "workoutProvider": None, "providerExerciseSourceId": None,
                    "weightValue": None, "weightUnit": None,
                },
            ],
            "endConditionValue": 6,
            "preferredEndConditionUnit": None,
            "endConditionCompare": None,
            "endCondition": {"conditionTypeId": 7, "conditionTypeKey": "iterations", "displayOrder": 7, "displayable": False},
            "skipLastRestStep": False,
            "smartRepeat": False,
        },
        # lap button 休息
        {
            "type": "ExecutableStepDTO",
            "stepId": None,
            "stepOrder": 6,
            "stepType": {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5},
            "childStepId": None,
            "description": None,
            "endCondition": {"conditionTypeId": 1, "conditionTypeKey": "lap.button", "displayOrder": 1, "displayable": True},
            "endConditionValue": None,
            "preferredEndConditionUnit": None,
            "endConditionCompare": None,
            "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
            "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
            "zoneNumber": None,
            "secondaryTargetType": None, "secondaryTargetValueOne": None,
            "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
            "secondaryZoneNumber": None, "endConditionZone": None,
            "strokeType": {},
            "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
            "category": None, "exerciseName": None,
            "workoutProvider": None, "providerExerciseSourceId": None,
            "weightValue": None, "weightUnit": None,
        },
        # REPEAT x4: 150m free + 25s rest
        {
            "type": "RepeatGroupDTO",
            "stepId": None,
            "stepOrder": 7,
            "stepType": {"stepTypeId": 6, "stepTypeKey": "repeat", "displayOrder": 6},
            "childStepId": 2,
            "numberOfIterations": 4,
            "workoutSteps": [
                {
                    "type": "ExecutableStepDTO",
                    "stepId": None,
                    "stepOrder": 8,
                    "stepType": {"stepTypeId": 3, "stepTypeKey": "interval", "displayOrder": 3},
                    "childStepId": 2,
                    "description": "自由泳，将单臂练习中感受到的髋部转动融入完整泳姿",
                    "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance", "displayOrder": 3, "displayable": True},
                    "endConditionValue": 150,
                    "preferredEndConditionUnit": {"unitKey": "meter"},
                    "endConditionCompare": None,
                    "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                    "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
                    "zoneNumber": None,
                    "secondaryTargetType": None, "secondaryTargetValueOne": None,
                    "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
                    "secondaryZoneNumber": None, "endConditionZone": None,
                    "strokeType": {"strokeTypeId": 6, "strokeTypeKey": "free", "displayOrder": 6},
                    "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
                    "category": None, "exerciseName": None,
                    "workoutProvider": None, "providerExerciseSourceId": None,
                    "weightValue": None, "weightUnit": None,
                },
                {
                    "type": "ExecutableStepDTO",
                    "stepId": None,
                    "stepOrder": 9,
                    "stepType": {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5},
                    "childStepId": 2,
                    "description": None,
                    "endCondition": {"conditionTypeId": 8, "conditionTypeKey": "fixed.rest", "displayOrder": 8, "displayable": True},
                    "endConditionValue": 25,
                    "preferredEndConditionUnit": None,
                    "endConditionCompare": None,
                    "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
                    "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
                    "zoneNumber": None,
                    "secondaryTargetType": None, "secondaryTargetValueOne": None,
                    "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
                    "secondaryZoneNumber": None, "endConditionZone": None,
                    "strokeType": {},
                    "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
                    "category": None, "exerciseName": None,
                    "workoutProvider": None, "providerExerciseSourceId": None,
                    "weightValue": None, "weightUnit": None,
                },
            ],
            "endConditionValue": 4,
            "preferredEndConditionUnit": None,
            "endConditionCompare": None,
            "endCondition": {"conditionTypeId": 7, "conditionTypeKey": "iterations", "displayOrder": 7, "displayable": False},
            "skipLastRestStep": False,
            "smartRepeat": False,
        },
        # lap button 休息
        {
            "type": "ExecutableStepDTO",
            "stepId": None,
            "stepOrder": 10,
            "stepType": {"stepTypeId": 5, "stepTypeKey": "rest", "displayOrder": 5},
            "childStepId": None,
            "description": None,
            "endCondition": {"conditionTypeId": 1, "conditionTypeKey": "lap.button", "displayOrder": 1, "displayable": True},
            "endConditionValue": None,
            "preferredEndConditionUnit": None,
            "endConditionCompare": None,
            "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
            "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
            "zoneNumber": None,
            "secondaryTargetType": None, "secondaryTargetValueOne": None,
            "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
            "secondaryZoneNumber": None, "endConditionZone": None,
            "strokeType": {},
            "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
            "category": None, "exerciseName": None,
            "workoutProvider": None, "providerExerciseSourceId": None,
            "weightValue": None, "weightUnit": None,
        },
        # 放松 200m free
        {
            "type": "ExecutableStepDTO",
            "stepId": None,
            "stepOrder": 11,
            "stepType": {"stepTypeId": 2, "stepTypeKey": "cooldown", "displayOrder": 2},
            "childStepId": None,
            "description": "轻松游，整理放松",
            "endCondition": {"conditionTypeId": 3, "conditionTypeKey": "distance", "displayOrder": 3, "displayable": True},
            "endConditionValue": 200,
            "preferredEndConditionUnit": {"unitKey": "meter"},
            "endConditionCompare": None,
            "targetType": {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target", "displayOrder": 1},
            "targetValueOne": None, "targetValueTwo": None, "targetValueUnit": None,
            "zoneNumber": None,
            "secondaryTargetType": None, "secondaryTargetValueOne": None,
            "secondaryTargetValueTwo": None, "secondaryTargetValueUnit": None,
            "secondaryZoneNumber": None, "endConditionZone": None,
            "strokeType": {"strokeTypeId": 6, "strokeTypeKey": "free", "displayOrder": 6},
            "equipmentType": {"equipmentTypeId": None, "equipmentTypeKey": None, "displayOrder": None},
            "category": None, "exerciseName": None,
            "workoutProvider": None, "providerExerciseSourceId": None,
            "weightValue": None, "weightUnit": None,
        },
    ]

    new["workoutSegments"] = [{
        "segmentOrder": 1,
        "sportType": {"sportTypeId": 4, "sportTypeKey": "swimming", "displayOrder": 3},
        "poolLengthUnit": {"unitId": 1, "unitKey": "meter", "factor": 100},
        "poolLength": 25,
        "avgTrainingSpeed": None,
        "estimatedDurationInSecs": None,
        "estimatedDistanceInMeters": None,
        "estimatedDistanceUnit": None,
        "estimateType": None,
        "description": None,
        "workoutSteps": steps,
    }]

    return new


# ─────────────────────────────────────────
# Main
# ─────────────────────────────────────────

BACKUP_FILE = "garmin_backup_20260317.json"
TARGET_DATE = "2026-03-17"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cookie", required=True)
    parser.add_argument("--jwt", default="")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不发送")
    parser.add_argument("--restore", action="store_true", help="从备份还原")
    args = parser.parse_args()

    headers = {
        "Content-Type": "application/json;charset=utf-8",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://connect.garmin.cn",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        "X-app-ver": "5.22.0.21b",
        "NK": "NT",
        "X-lang": "zh-CN",
        "Cookie": args.cookie,
    }
    if args.jwt:
        headers["Authorization"] = f"Bearer {args.jwt}"

    # ── 还原模式 ──
    if args.restore:
        if not os.path.exists(BACKUP_FILE):
            print(f"❌ 找不到备份文件 {BACKUP_FILE}")
            sys.exit(1)
        with open(BACKUP_FILE) as f:
            backup = json.load(f)
        workout_id = backup["workoutId"]
        print(f"正在还原 workoutId={workout_id} ...")
        result, err = put_workout(workout_id, backup, headers)
        if err:
            print(f"❌ 还原失败: {err}")
        else:
            print(f"✅ 还原成功！Garmin Connect 已恢复到原始内容。")
        return

    # ── 1. 拉取 2026-03-17 的已排期 workouts ──
    print(f"[1/4] 拉取 {TARGET_DATE} 的训练计划...")
    scheduled = get_scheduled_workouts(headers, TARGET_DATE, TARGET_DATE)

    if scheduled is None:
        print("❌ 请求失败，检查 Cookie 是否过期")
        sys.exit(1)

    if not scheduled:
        print(f"⚠️  {TARGET_DATE} 没有找到任何训练。请确认 Garmin Coach 计划包含这一天。")
        sys.exit(1)

    print(f"  找到 {len(scheduled)} 条训练：")
    for s in scheduled:
        print(f"    workoutId={s.get('workoutId')}  name={s.get('workoutName')}  sport={s.get('sportType',{}).get('sportTypeKey')}")

    # 取第一条（游泳那条）
    target = scheduled[0]
    workout_id = target["workoutId"]

    # ── 2. 拉取完整 workout 数据并备份 ──
    print(f"\n[2/4] 拉取 workoutId={workout_id} 完整数据并备份...")
    detail = get_workout_detail(workout_id, headers)
    if not detail:
        print("❌ 获取详情失败")
        sys.exit(1)

    with open(BACKUP_FILE, "w") as f:
        json.dump(detail, f, ensure_ascii=False, indent=2)
    print(f"  ✅ 备份已保存到 {BACKUP_FILE}")
    print(f"  原始内容：{detail.get('workoutName')}")

    # ── 3. 构建新内容 ──
    print(f"\n[3/4] 构建新训练内容...")
    new_workout = build_new_swim_workout(detail)
    print(f"  新名称：{new_workout['workoutName']}")
    print(f"  步骤数：{len(new_workout['workoutSegments'][0]['workoutSteps'])}")

    if args.dry_run:
        print(f"\n[DRY RUN] 以下是将要发送的 JSON（前500字符）：")
        print(json.dumps(new_workout, ensure_ascii=False)[:500] + "...")
        print(f"\n✅ Dry run 完成，未实际修改。去掉 --dry-run 参数即可真正执行。")
        return

    # ── 4. PUT 覆盖 ──
    print(f"\n[4/4] 发送 PUT 请求覆盖 workoutId={workout_id}...")
    result, err = put_workout(workout_id, new_workout, headers)
    if err:
        print(f"❌ 失败: {err}")
        print(f"  备份仍在 {BACKUP_FILE}，随时可以 --restore 还原")
        sys.exit(1)

    print(f"✅ 成功！workoutId={workout_id} 已更新为我们的训练内容。")
    print(f"  打开 Garmin Connect App → 手动同步手表即可看到新训练。")
    print(f"  如需还原：python3 {os.path.basename(__file__)} --cookie '...' --restore")


if __name__ == "__main__":
    main()
