# 3D Print Queue (Google Apps Script + Google Sheets)

Web app สำหรับจัดการคิวงานพิมพ์ 3D: ดูงานที่รอพิมพ์ สีที่ใส่ประจำแต่ละเครื่อง (เครื่องละ 4 สี)
และประวัติงานที่พิมพ์เสร็จ ใช้ Google Apps Script (GAS) เป็น backend และ Google Sheets เป็นฐานข้อมูล

ฐานข้อมูล: Google Sheet **"3DPrint JOB"**
(`13fuUSHjSdJ7jBUp0AjRi3HIU7Ze7ZNkMsA5sGZir1dg`) กำหนดไว้ที่ `SPREADSHEET_ID` ใน `code.gs`
— ถ้าจะเปลี่ยนไปใช้ sheet อื่น แก้ค่านี้ค่าเดียว

## โครงสร้างไฟล์

- `appsscript.json` — manifest ของโปรเจกต์
- `code.gs` — server-side logic (เพิ่ม/ลบเครื่อง, บันทึกสี, เพิ่มงาน, ย้ายงานไปพิมพ์เสร็จ)
- `index.html` — หน้าเว็บทั้งหมดในไฟล์เดียว (HTML + CSS + JavaScript)

## ฟีเจอร์

### แท็บ แดชบอร์ด (เครื่องพิมพ์)
- ปุ่ม **+ เพิ่มเครื่องพิมพ์** ตั้งชื่อเครื่องอัตโนมัติตามตัวอักษรวิทยุการบิน (NATO):
  Alpha, Bravo, Charlie, Delta, ... Zulu แล้วต่อด้วย Alpha 2, Bravo 2, ...
  - ถ้าลบเครื่องไป ชื่อนั้นจะถูกนำกลับมาใช้กับเครื่องถัดไปที่เพิ่ม (เติมช่องว่างก่อน)
- แต่ละเครื่องมี **ช่องสี 4 ช่อง** คลิกที่ช่องเพื่อเลือกสี — ใช้ตัวเลือกสีมาตรฐานของ browser
  ซึ่งบน Windows (Chrome / Edge) จะเปิดหน้าต่าง **Color** ของ Windows (Basic colors 48 สี +
  Define Custom Colors) เลือกแล้วระบบ **บันทึกทับสีเดิมทันที** ไม่ต้องกดบันทึก
  ปุ่ม "ล้าง" ใต้ช่องสีใช้เคลียร์ช่องนั้นให้ว่าง
- แต่ละการ์ดแสดงงานค้างพิมพ์ของเครื่องนั้น พร้อมเวลานำเข้า และปุ่ม **✓ พิมพ์เสร็จ**
- ปุ่ม "ลบเครื่อง" ลบได้เฉพาะเครื่องที่ไม่มีงานค้างพิมพ์

### แท็บ งานค้างพิมพ์
- ฟอร์มเพิ่มงาน: พิมพ์ชื่องาน + เลือกเครื่องพิมพ์จาก dropdown (ดึงจากรายการเครื่อง) แล้วกด
  **เพิ่มเข้าคิว** — ระบบบันทึกเวลานำเข้าให้อัตโนมัติ
- **รายการรวมงานค้างพิมพ์** ทุกเครื่อง: ชื่องาน, ชื่อเครื่องพิมพ์ (พร้อมจุดสีของเครื่อง),
  เวลานำเข้า เรียงตามลำดับที่เข้าคิว
- ปุ่ม **✓ พิมพ์เสร็จ** → ลบออกจากคิว และย้ายไปเก็บที่รายการพิมพ์เสร็จ (บันทึกเวลาเสร็จ)
- ปุ่ม **ลบ** → เอาออกจากคิวโดยไม่บันทึกว่าพิมพ์เสร็จ (กรณีเพิ่มผิด/ยกเลิกงาน)

### แท็บ พิมพ์เสร็จแล้ว
แสดงชื่องาน, ชื่อเครื่องพิมพ์, เวลานำเข้า และเวลาพิมพ์เสร็จ (ล่าสุดอยู่บนสุด)

> หน้าเว็บจะดึงข้อมูลใหม่ทุก 1 นาที เพื่อให้เห็นงานที่คนอื่นเพิ่ม/กดเสร็จด้วย

## ข้อมูลใน Google Sheet

ระบบสร้าง sheet (พร้อม header) ให้อัตโนมัติเมื่อเปิดใช้งานครั้งแรก:

| Sheet      | คอลัมน์ |
|------------|---------|
| `Printers` | Printer ID, Name, Color 1, Color 2, Color 3, Color 4, Created At |
| `Queue`    | Job ID, Job, Printer ID, Printer Name, Added At |
| `Done`     | Job ID, Job, Printer Name, Added At, Done At |

สีเก็บเป็นรหัส hex (เช่น `#ff0000`) ช่องว่าง = ยังไม่ได้ใส่สี

## วิธี Deploy

1. เปิด Google Sheet "3DPrint JOB"
   (https://docs.google.com/spreadsheets/d/13fuUSHjSdJ7jBUp0AjRi3HIU7Ze7ZNkMsA5sGZir1dg/edit)
2. เปิด **Extensions > Apps Script** (หรือสร้างโปรเจกต์แยกที่ script.google.com ก็ได้
   เพราะโค้ดเปิด sheet ด้วย ID อยู่แล้ว)
3. มีแค่ 2 ไฟล์: เปลี่ยนชื่อไฟล์ `Code.gs` เริ่มต้นเป็น `code.gs` และกด **+ > HTML**
   สร้างไฟล์ชื่อ `index` (editor จะแสดงเป็น `index.html`)
4. คัดลอกเนื้อหาจาก `code.gs` และ `index.html` ในโฟลเดอร์นี้ไปวางแทนของเดิมทั้งหมด
5. เปิด **Project Settings** > ติ๊ก "Show appsscript.json manifest file" แล้วแก้ให้ตรงกับ
   `appsscript.json` ในโฟลเดอร์นี้ (ไม่บังคับ — เวลาบนหน้าเว็บกำหนดเป็นเวลาไทยไว้ที่ `TIME_ZONE` ใน `code.gs` แล้ว)
6. กด **Deploy > New deployment**
   - Select type: **Web app**
   - Execute as: **Me** (ทุกคนเขียนลง sheet เดียวกันได้โดยไม่ต้องแชร์สิทธิ์ sheet)
   - Who has access: เลือกตามต้องการ (เช่น Anyone with Google account หรือเฉพาะในองค์กร)
7. ครั้งแรกจะมีหน้าขอสิทธิ์ (Authorize access) ให้กดอนุญาตการเข้าถึง Google Sheets
   (ถ้าขึ้น "Google hasn't verified this app" ให้กด Advanced > Go to ... (unsafe) ได้ เพราะเป็น
   script ของเราเอง)
8. กด Deploy แล้วคัดลอก Web app URL ไปใช้งาน (bookmark ไว้ในเครื่อง / มือถือได้เลย)

> แก้โค้ดภายหลัง: กด **Deploy > Manage deployments > Edit > Version: New version**
> เพื่อให้ URL เดิมใช้โค้ดใหม่

### ใช้ clasp (ทางเลือกสำหรับ deploy ผ่าน CLI)

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "3D Print Queue"
# คัดลอกไฟล์ในโฟลเดอร์นี้ไปยังโฟลเดอร์โปรเจกต์ที่ clasp สร้าง แล้ว
clasp push
clasp deploy
```

## การปรับแต่งที่อาจต้องทำเพิ่ม

- **โลโก้ด้านบน**: ดึงจาก Google Drive (ไฟล์ `1TCIgIjY4dLXY08wZIjGq2cNA7bv19rIx`) ผ่าน
  `https://lh3.googleusercontent.com/d/<FILE_ID>=h300` ซึ่งเป็นภาพย่อสูง 300px โหลดเร็วกว่าไฟล์จริง
  — ไฟล์ต้องแชร์แบบ **"ทุกคนที่มีลิงก์"** ไว้เสมอ ถ้าเปลี่ยนโลโก้ ให้แก้ FILE_ID ใน `<img class="app-logo">`
  ใน `index.html` / ปรับขนาดที่ `.app-logo` (PC 112px, notebook 96px, mobile 72px)

- **เปลี่ยนจำนวนช่องสีต่อเครื่อง**: แก้ `COLOR_SLOTS` ทั้งใน `code.gs` และ `index.html`
  และเพิ่มคอลัมน์ `Color N` ใน `PRINTER_HEADERS`
- **เปลี่ยนรูปแบบเวลา**: แก้ `formatTime_` ใน `code.gs` / เปลี่ยน time zone ที่ `TIME_ZONE`
- **เวลาที่เห็นใน Google Sheet เอง** แสดงตาม time zone ของไฟล์ sheet (File > Settings > Time zone)
  ซึ่งแยกจากหน้าเว็บ — ถ้าเปลี่ยนเป็น GMT+07:00 แถวที่บันทึกไว้ก่อนหน้าจะคลาดไป 7 ชม.
  (Sheets เก็บเป็นเวลาตามนาฬิกา ไม่ได้แปลงให้) จึงควรเปลี่ยนตอนที่ยังไม่มีข้อมูลจริง
- **ความถี่ในการ refresh อัตโนมัติ**: แก้ `REFRESH_MS` ใน `index.html`
