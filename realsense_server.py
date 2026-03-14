#!/usr/bin/env python3
"""
Intel RealSense D435i WebSocket Server
距離データをWebアプリへ送信する

必要パッケージ:
    pip install pyrealsense2 websockets numpy

使い方:
    python realsense_server.py
    → ws://localhost:8765 でWebSocket待受開始
"""

import asyncio
import json
import logging

import numpy as np
import pyrealsense2 as rs
import websockets

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

HOST = "localhost"
PORT = 8765
SEND_HZ = 10          # フレームレート (送信回数/秒)
DEPTH_WIDTH = 640
DEPTH_HEIGHT = 480
DEPTH_FPS = 30
# 画面中央の何割の領域を使って距離を計算するか (0.0〜1.0)
CENTER_CROP = 0.5
# 距離の最大値 (cm)。これ以上は無効値として除外
MAX_DIST_CM = 400


def get_center_distance_cm(depth_frame: rs.depth_frame) -> float:
    """
    フレーム中央 CENTER_CROP 領域の最小距離(cm)を返す。
    有効ピクセルがなければ 0.0 を返す。
    """
    depth_image = np.asanyarray(depth_frame.get_data())
    h, w = depth_image.shape
    cy0 = int(h * (1 - CENTER_CROP) / 2)
    cy1 = h - cy0
    cx0 = int(w * (1 - CENTER_CROP) / 2)
    cx1 = w - cx0
    region = depth_image[cy0:cy1, cx0:cx1]

    # ゼロ (無効値) を除外
    valid = region[region > 0]
    if valid.size == 0:
        return 0.0

    # センサーの距離単位 → メートル → cm
    dist_m = float(np.percentile(valid, 5)) * depth_frame.get_units()
    dist_cm = dist_m * 100.0

    if dist_cm > MAX_DIST_CM:
        return MAX_DIST_CM
    return round(dist_cm, 1)


async def realsense_handler(websocket):
    client = websocket.remote_address
    log.info(f"Client connected: {client}")

    pipeline = rs.pipeline()
    config = rs.config()
    config.enable_stream(rs.stream.depth, DEPTH_WIDTH, DEPTH_HEIGHT, rs.format.z16, DEPTH_FPS)

    try:
        pipeline.start(config)
        log.info("RealSense D435i pipeline started")
        interval = 1.0 / SEND_HZ

        while True:
            frames = pipeline.wait_for_frames(timeout_ms=2000)
            depth_frame = frames.get_depth_frame()
            if not depth_frame:
                continue

            dist_cm = get_center_distance_cm(depth_frame)
            payload = json.dumps({"distance": dist_cm})

            try:
                await websocket.send(payload)
            except websockets.exceptions.ConnectionClosed:
                break

            await asyncio.sleep(interval)

    except Exception as e:
        log.error(f"Error: {e}")
    finally:
        pipeline.stop()
        log.info(f"Client disconnected: {client}")


async def main():
    log.info(f"Starting RealSense WebSocket server on ws://{HOST}:{PORT}")
    async with websockets.serve(realsense_handler, HOST, PORT):
        log.info("Server ready. Open the web app and select 'RealSense' mode.")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
