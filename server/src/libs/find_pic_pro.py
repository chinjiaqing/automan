"""
find_pic_pro.py - 高鲁棒性模板匹配（SIFT + FLANN + RANSAC）

对缩放、旋转、光照变化的动态图片具有强识别能力。
当 SIFT 特征点不足时自动回退到多尺度模板匹配。

用法: echo '{"image":"base64...","template":"base64..."}' | python find_pic_pro.py

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


# ── SIFT + FLANN + RANSAC 匹配 ─────────────────────

def sift_match(src: np.ndarray, tpl: np.ndarray,
               min_features: int = 4,
               ratio_threshold: float = 0.75) -> list:
    """
    SIFT 特征点匹配
    :return: [(x, y, confidence), ...] 匹配中心点列表
    """
    sift = cv2.SIFT_create()

    src_gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
    tpl_gray = cv2.cvtColor(tpl, cv2.COLOR_BGR2GRAY)

    kp1, des1 = sift.detectAndCompute(tpl_gray, None)
    kp2, des2 = sift.detectAndCompute(src_gray, None)

    # 特征点不足
    if des1 is None or des2 is None or len(kp1) < min_features or len(kp2) < min_features:
        return []

    # FLANN 匹配器
    index_params = dict(algorithm=1, trees=5)  # FLANN_INDEX_KDTREE
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    raw_matches = flann.knnMatch(des1, des2, k=2)

    # Lowe's ratio test 过滤
    good_matches = []
    for m_pair in raw_matches:
        if len(m_pair) == 2:
            m, n = m_pair
            if m.distance < ratio_threshold * n.distance:
                good_matches.append(m)

    if len(good_matches) < min_features:
        return []

    # 提取匹配点坐标
    tpl_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
    src_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

    # RANSAC 过滤 + 单应性矩阵
    H, mask = cv2.findHomography(tpl_pts, src_pts, cv2.RANSAC, 5.0)

    if H is None or mask is None:
        return []

    inliers = mask.ravel().tolist()
    inlier_count = sum(inliers)

    if inlier_count < min_features:
        return []

    # 用单应性矩阵变换模板四角到源图坐标
    th, tw = tpl.shape[:2]
    corners = np.float32([[0, 0], [tw, 0], [tw, th], [0, th]]).reshape(-1, 1, 2)
    transformed = cv2.perspectiveTransform(corners, H)

    # 计算匹配区域的中心点
    cx = int(np.mean(transformed[:, 0, 0]))
    cy = int(np.mean(transformed[:, 0, 1]))

    # 置信度 = inlier 比率 × 匹配质量
    confidence = min(1.0, (inlier_count / len(good_matches)) * 0.7 + (inlier_count / max(len(kp1), 1)) * 0.3)

    return [(cx, cy, round(confidence, 4))]


# ── 多尺度模板匹配（兜底） ──────────────────────────

def multiscale_match(src: np.ndarray, tpl: np.ndarray,
                     threshold: float = 0.8,
                     scales: list = None,
                     max_results: int = 10) -> list:
    """
    多尺度模板匹配（当 SIFT 失败时使用）
    :return: [(x, y, confidence), ...]
    """
    if scales is None:
        scales = [0.5, 0.75, 1.0, 1.25, 1.5]

    src_gray = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY)
    tpl_gray = cv2.cvtColor(tpl, cv2.COLOR_BGR2GRAY)
    th_orig, tw_orig = tpl_gray.shape[:2]

    best_matches = []

    for scale in scales:
        new_w = int(tw_orig * scale)
        new_h = int(th_orig * scale)
        if new_w < 10 or new_h < 10:
            continue
        if new_w > src_gray.shape[1] or new_h > src_gray.shape[0]:
            continue

        resized = cv2.resize(tpl_gray, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        result = cv2.matchTemplate(src_gray, resized, cv2.TM_CCOEFF_NORMED)
        locations = np.where(result >= threshold)

        for pt_y, pt_x in zip(*locations):
            conf = float(result[pt_y, pt_x])
            # 中心点坐标
            cx = int(pt_x + new_w / 2)
            cy = int(pt_y + new_h / 2)
            best_matches.append((cx, cy, conf, scale))

    if not best_matches:
        return []

    # 按置信度排序
    best_matches.sort(key=lambda m: m[2], reverse=True)

    # NMS 去重
    min_dist = max(tw_orig, th_orig) * 0.4
    deduped = []
    for cx, cy, conf, scale in best_matches:
        if len(deduped) >= max_results:
            break
        if not any(abs(d[0] - cx) < min_dist and abs(d[1] - cy) < min_dist for d in deduped):
            deduped.append((cx, cy, conf))

    return deduped


# ── 主函数 ──────────────────────────────────────────

def find_pic_pro(image_b64: str, template_b64: str, threshold: float = 0.8,
                 max_results: int = 10, region: list = None,
                 scales: list = None, min_features: int = 4) -> dict:
    """
    高鲁棒性找图
    :param image_b64: 截图 base64
    :param template_b64: 模板图片 base64
    :param threshold: 相似度阈值 0-1（多尺度兜底时使用）
    :param max_results: 最大匹配数量
    :param region: 找图区域 [x1, y1, x2, y2]，全为0表示全图
    :param scales: 多尺度缩放列表（兜底时使用）
    :param min_features: SIFT 最少特征点数
    :return: {matches: [{x, y, confidence, method}], elapsed: ms}
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
        return {"matches": [], "elapsed": round((time.perf_counter() - t0) * 1000, 1), "method": "none"}

    # ── 第一策略：SIFT + FLANN + RANSAC ──
    sift_results = sift_match(src, tpl, min_features=min_features)

    if sift_results:
        matches = [
            {"x": x + offset_x, "y": y + offset_y, "confidence": conf, "method": "sift"}
            for x, y, conf in sift_results
        ]
        elapsed = round((time.perf_counter() - t0) * 1000, 1)
        return {"matches": matches, "elapsed": elapsed, "method": "sift"}

    # ── 兜底策略：多尺度模板匹配 ──
    ms_results = multiscale_match(src, tpl, threshold=threshold,
                                  scales=scales, max_results=max_results)

    matches = [
        {"x": x + offset_x, "y": y + offset_y, "confidence": conf, "method": "multiscale"}
        for x, y, conf in ms_results
    ]

    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    method = "multiscale" if matches else "none"
    return {"matches": matches, "elapsed": elapsed, "method": method}


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
    scales = input_data.get("scales", None)
    min_features = input_data.get("minFeatures", 4)

    if not image_b64 or not template_b64:
        print(json.dumps({"error": "image 和 template 均为必填"}))
        sys.exit(1)

    try:
        result = find_pic_pro(image_b64, template_b64, threshold, max_results,
                              region, scales, min_features)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
