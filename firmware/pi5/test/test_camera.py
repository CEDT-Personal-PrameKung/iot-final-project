#!/usr/bin/env python3
"""
Raspberry Pi 5 Camera Test Script
รองรับทั้งกล้อง CSI (Pi Camera ผ่าน Picamera2 / rpicam) และกล้อง USB Webcam (ผ่าน OpenCV / V4L2)
"""

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime


def run_cmd(cmd):
    try:
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return res.returncode, res.stdout.strip(), res.stderr.strip()
    except Exception as e:
        return -1, "", str(e)


def list_cameras():
    print("=" * 60)
    print("🔍 1. ตรวจสอบกล้อง CSI (Raspberry Pi Camera / rpicam)")
    print("=" * 60)
    code, out, err = run_cmd("rpicam-hello --list-cameras")
    output = out if out else err
    print(output)
    has_csi = "Available cameras" in output and "No cameras available" not in output

    print("\n" + "=" * 60)
    print("🔍 2. ตรวจสอบอุปกรณ์ Video ทั้งหมด (v4l2-ctl)")
    print("=" * 60)
    code, out, err = run_cmd("v4l2-ctl --list-devices")
    v4l2_out = out if out else err
    print(v4l2_out if v4l2_out else "ไม่พบคำสั่ง v4l2-ctl หรือไม่มีอุปกรณ์")

    # ตรวจสอบ USB camera (ที่ไม่ได้มาจากพอร์ต platform: pispbe, rp1-cfe, rpi-hevc-dec)
    usb_devs = []
    if v4l2_out:
        blocks = v4l2_out.split("\n\n")
        for block in blocks:
            lines = [line.strip() for line in block.strip().split("\n") if line.strip()]
            if not lines:
                continue
            header = lines[0]
            if not any(ignore in header for ignore in ["pispbe", "rp1-cfe", "rpi-hevc-dec"]):
                devs = [d for d in lines[1:] if d.startswith("/dev/video")]
                if devs:
                    usb_devs.append((header, devs[0]))

    print("\n" + "=" * 60)
    print("📋 สรุปผลการตรวจพบกล้อง")
    print("=" * 60)
    if has_csi:
        print("✅ พบกล้อง CSI (Pi Camera)")
    else:
        print("❌ ไม่พบกล้อง CSI (หากต่อสายแพแล้ว ให้เช็คการเสียบสายหรือตั้งค่าใน /boot/firmware/config.txt)")

    if usb_devs:
        for name, dev in usb_devs:
            print(f"✅ พบกล้อง USB: {name} -> {dev}")
    else:
        print("❌ ไม่พบกล้อง USB Webcam")

    return has_csi, usb_devs


def test_csi_camera(output_file, preview=False):
    print(f"\n📸 กำลังทดสอบถ่ายภาพด้วยกล้อง CSI (Picamera2 + OpenCV)...")
    try:
        from picamera2 import Picamera2
        import cv2

        picam2 = Picamera2()
        if not picam2.global_camera_info():
            print("❌ Picamera2 ไม่พบกล้องที่เชื่อมต่ออยู่")
            return False

        # ใช้ RGB888 แล้วสลับสีเป็น BGR สำหรับ OpenCV หรือใช้การแสดงผลผ่าน OpenCV แทน EGL เพื่อเลี่ยงปัญหา failed to import fd
        config = picam2.create_preview_configuration(main={"size": (1280, 720), "format": "RGB888"})
        picam2.configure(config)
        picam2.start()

        # เปิด Auto Focus แบบต่อเนื่อง (สำหรับ Camera Module 3 / IMX708)
        try:
            picam2.set_controls({"AfMode": 2})
        except Exception:
            pass

        if preview:
            print("🖥️ กำลังเปิดหน้าต่าง Live Preview...")
            print("   👉 กด 's' เพื่อถ่ายภาพเพิ่ม")
            print("   👉 กด 'q' หรือ ESC เพื่อปิดหน้าต่าง")
            saved_once = False
            while True:
                frame = picam2.capture_array()
                # Picamera2 format "RGB888" จริงๆ คือลำดับ BGR ในหน่วยความจำของ libcamera ซึ่งตรงกับ OpenCV พอดี
                if not saved_once:
                    cv2.imwrite(output_file, frame)
                    print(f"✅ บันทึกภาพแรกสำเร็จ: {os.path.abspath(output_file)}")
                    saved_once = True

                cv2.imshow("Raspberry Pi 5 Camera Preview (Press 's' to save, 'q' to quit)", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q") or key == 27:
                    break
                elif key == ord("s"):
                    snap_name = f"snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
                    cv2.imwrite(snap_name, frame)
                    print(f"📸 บันทึกภาพเพิ่มเติม: {os.path.abspath(snap_name)}")
            cv2.destroyAllWindows()
        else:
            print("⏳ รอกล้องปรับแสงและโฟกัส 2 วินาที...")
            time.sleep(2)
            picam2.capture_file(output_file)
            print(f"✅ บันทึกภาพสำเร็จ: {os.path.abspath(output_file)}")

        picam2.stop()
        picam2.close()
        return True
    except Exception as e:
        print(f"⚠️ เกิดข้อผิดพลาดกับ Picamera2: {e}")
        print("🔄 ลองใช้คำสั่ง rpicam-still แทน...")
        cmd = f"rpicam-still -t 2000 -o {output_file} --qt-preview" if preview else f"rpicam-still -t 2000 -n -o {output_file}"
        code, out, err = run_cmd(cmd)
        if code == 0 and os.path.exists(output_file):
            print(f"✅ บันทึกภาพสำเร็จด้วย rpicam-still: {os.path.abspath(output_file)}")
            return True
        else:
            print(f"❌ ไม่สามารถถ่ายภาพได้: {err}")
            return False


def test_usb_camera(device, output_file, preview=False):
    print(f"\n📸 กำลังทดสอบถ่ายภาพด้วยกล้อง USB ({device}) ผ่าน OpenCV...")
    try:
        import cv2
        # แปลง '/dev/video0' เป็น index หรือส่ง path เข้าไป
        cap = cv2.VideoCapture(device)
        if not cap.isOpened():
            print(f"❌ ไม่สามารถเปิดกล้องที่ {device} ได้")
            return False

        # อ่านทิ้งสัก 5 เฟรมเพื่อให้กล้องปรับแสงอัตโนมัติ
        for _ in range(5):
            cap.read()
            time.sleep(0.1)

        ret, frame = cap.read()
        if not ret or frame is None:
            print("❌ ไม่สามารถอ่านภาพจากกล้องได้")
            cap.release()
            return False

        cv2.imwrite(output_file, frame)
        h, w = frame.shape[:2]
        print(f"✅ บันทึกภาพสำเร็จ ({w}x{h}): {os.path.abspath(output_file)}")

        if preview:
            print("🖥️ กำลังแสดงหน้าต่าง Live Preview (กด 'q' เพื่อปิด)...")
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                cv2.imshow(f"Camera Test ({device}) - Press 'q' to exit", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            cv2.destroyAllWindows()

        cap.release()
        return True
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาดในการใช้ OpenCV: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="สคริปต์ทดสอบกล้องสำหรับ Raspberry Pi 5")
    parser.add_argument("--list", action="store_true", help="แสดงรายชื่อกล้องที่ตรวจพบอย่างเดียว")
    parser.add_argument("--type", choices=["auto", "csi", "usb"], default="auto", help="เลือกประเภทกล้อง (ค่าเริ่มต้น: auto)")
    parser.add_argument("--device", default=None, help="ระบุอุปกรณ์ USB เช่น /dev/video0")
    parser.add_argument("--preview", action="store_true", help="เปิดหน้าจอ Preview (ต้องต่อจอหรือใช้ VNC/Desktop)")
    parser.add_argument("-o", "--output", default=None, help="ชื่อไฟล์ภาพที่ต้องการบันทึก")
    args = parser.parse_args()

    has_csi, usb_devs = list_cameras()

    if args.list:
        return

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = args.output or f"camera_test_{timestamp}.jpg"

    if args.type == "csi":
        test_csi_camera(output_file, preview=args.preview)
    elif args.type == "usb":
        dev = args.device or (usb_devs[0][1] if usb_devs else "/dev/video0")
        test_usb_camera(dev, output_file, preview=args.preview)
    else:
        # Auto mode
        if has_csi:
            test_csi_camera(output_file, preview=args.preview)
        elif usb_devs:
            test_usb_camera(usb_devs[0][1], output_file, preview=args.preview)
        elif args.device:
            test_usb_camera(args.device, output_file, preview=args.preview)
        else:
            print("\n⚠️ ไม่พบกล้องที่พร้อมใช้งานในขณะนี้!")
            print("คำแนะนำสำหรับ Raspberry Pi 5:")
            print("  1. หากใช้กล้องสายแพ (CSI): ปิดเครื่อง ขยับสายแพที่ช่อง CAM/DISP (หันด้านทองเหลืองเข้าหาพอร์ต Ethernet/USB) แล้วเปิดเครื่องใหม่")
            print("  2. หากใช้กล้อง USB: ลองเสียบใหม่แล้วเช็คด้วยคำสั่ง `lsusb`")


if __name__ == "__main__":
    main()
