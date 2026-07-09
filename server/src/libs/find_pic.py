"""
find_pic.py - 高性能模板匹配（OpenCV matchTemplate）
通过 stdin 接收 JSON 参数，stdout 输出 JSON 结果

用法: echo '{"image":"base64...","template":"base64..."}' | python find_pic.py

依赖: opencv-python, numpy（通过 server/.venv 管理）
"""

import sys
import json
import time
import base64
import numpy as np
import cv2


def decode_base64_image(b64_string: str) -> np.ndarray:
    """将 base64 字符串解码为 OpenCV 图像（BGR）"""
    if ',' in b64_string:
        b64_string = b64_string.split(',', 1)[1]
    raw = base64.b64decode(b64_string)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("无法解码图片")
    return img


def find_pic(image_b64: str, template_b64: str, threshold: float = 0.8,
             max_results: int = 10, region: list = None) -> dict:
    """
    模板匹配
    :param image_b64: 截图 base64
    :param template_b64: 模板图片 base64
    :param threshold: 相似度阈值 0-1
    :param max_results: 最大匹配数量
    :param region: 找图区域 [x1, y1, x2, y2]，全为0表示全图
    :return: {matches: [{x, y, confidence}], elapsed: ms}
    """
    t0 = time.perf_counter()

    src = decode_base64_image(image_b64)
    tpl = decode_base64_image(template_b64)

    # 裁切找图区域
    offset_x, offset_y = 0, 0
    if region and len(region) == 4:
        x1, y1, x2, y2 = region
        if x1 != 0 or y1 != 0 or x2 != 0 or y2 != 0:
            x1 = max(0, min(x1, src.shape[1]))
            y1 = max(0, min(y1, src.shape[0]))
            x2 = max(x1 + 1, min(x2, src.shape[1]))
            y2 = max(y1 + 1, min(y2, src.shape[0]))
            src = src[y1:y2, x1:x2]
            offset_x, offset_y = x1, y1

    th, tw = tpl.shape[:2]
    sh, sw = src.shape[:2]

    if tw > sw or th > sh:
        return {"matches": [], "elapsed": round((time.perf_counter() - t0) * 1000, 1)}

    src_gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
    tpl_gray = cv2.cvtColor(tpl, cv2.COLOR_BGR2GRAY)

    # TM_CCOEFF_NORMED = NCC，内部 FFT 加速
    result = cv2.matchTemplate(src_gray, tpl_gray, cv2.TM_CCOEFF_NORMED)
    locations = np.where(result >= threshold)

    if len(locations[0]) == 0:
        return {"matches": [], "elapsed": round((time.perf_counter() - t0) * 1000, 1)}

    matches_raw = []
    for pt_y, pt_x in zip(*locations):
        matches_raw.append((float(result[pt_y, pt_x]), int(pt_x), int(pt_y)))

    matches_raw.sort(key=lambda m: m[0], reverse=True)

    # 非极大值抑制（距离去重）
    min_dist = max(tw, th) * 0.5
    deduped = []
    for conf, x, y in matches_raw:
        if len(deduped) >= max_results:
            break
        if not any(abs(d[1] - x) < min_dist and abs(d[2] - y) < min_dist for d in deduped):
            deduped.append((conf, x, y))

    matches = [
        {"x": x + offset_x, "y": y + offset_y, "confidence": round(conf, 4)}
        for conf, x, y in deduped
    ]

    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    return {"matches": matches, "elapsed": elapsed}


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON 解析失败: {e}"}))
        sys.exit(1)

    image_b64 = input_data.get("image", "")
    template_b64 = input_data.get("template", "")
    threshold = input_data.get("threshold", 0.8)
    max_results = input_data.get("maxResults", 10)
    region = input_data.get("region", [0, 0, 0, 0])

    if not image_b64 or not template_b64:
        print(json.dumps({"error": "image 和 template 均为必填"}))
        sys.exit(1)

    try:
        result = find_pic(image_b64, template_b64, threshold, max_results, region)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
