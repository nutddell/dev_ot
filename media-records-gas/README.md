# Media Records Management (Google Apps Script + Google Sheets)

Web app แบบ 2 แท็บ สำหรับกรอกและค้นหาข้อมูลระเบียน media โดยใช้ Google Apps Script (GAS)
เป็น backend และ Google Sheets เป็นฐานข้อมูล

## โครงสร้างไฟล์

- `appsscript.json` — manifest ของโปรเจกต์
- `Code.gs` — server-side logic (บันทึกข้อมูล, gen Media ID, ค้นหา)
- `Index.html` — หน้าเว็บหลัก (แท็บ กรอกข้อมูล / ค้นหา)
- `Stylesheet.html` — CSS โทนสีเขียว
- `JavaScript.html` — client-side script

## ฟีเจอร์

### แท็บ กรอกข้อมูล
ฟิลด์: Media Name, Agency / House, Version, Type of Media (dropdown: AIS Inhouse (AI),
AIS Partner (AP), Advertise (AD))

เมื่อกดบันทึก ระบบจะ gen **Media ID** อัตโนมัติ รูปแบบ:

```
{TYPE}_{RUNNING 4 หลัก}_{DDMMYYYY}
เช่น AI_0001_26082026
```

> หมายเหตุ: running number นับแยกตาม Type of Media แต่ละประเภท (เช่น AI, AP, AD
> จะมีเลขรันของตัวเอง ไม่ปนกัน) โดยดูจากเลขสูงสุดที่เคยมีของ type นั้นใน sheet แล้ว +1
> ถ้าต้องการให้นับรวมกันทุก type (เลขรันเดียวกันไม่ว่าจะ type ไหน) แจ้งได้
> แก้ที่ฟังก์ชัน `generateMediaId_` ใน `Code.gs`

ข้อมูลที่บันทึกลง Sheet (sheet ชื่อ "Media Records"): Media ID, Media Name, Agency/House,
Version, Type of Media

### แท็บ ค้นหา
ค้นหาจาก Media Name หรือ Agency/House (ค้นแบบ partial match, ไม่สนตัวพิมพ์เล็ก/ใหญ่)
แสดงผลลัพธ์เป็นตาราง: Media ID, Media Name, Agency/House, Version, Type of Media
(แสดงทั้ง Media Name และ Agency/House เสมอ ไม่ว่าจะค้นด้วยฟิลด์ไหน)

### หน้า Login
ตรวจสอบ username/password จาก sheet ชื่อ **`user_mng`** ที่มีคอลัมน์:

| username | password | type of user |
|----------|----------|--------------|
| user1    | 1234     | All          |
| user2    | 1234     | Media        |
| user3    | 1234     | Operation    |

sheet นี้จะถูกสร้างอัตโนมัติ (พร้อม header) เมื่อรันครั้งแรก แต่ **ต้องเพิ่มข้อมูล user เอง**
ก่อนใช้งานจริง (เข้า sheet โดยตรงแล้วพิมพ์เพิ่มทีละแถว)

สิทธิ์การใช้งานตาม `type of user`:

| type      | กรอกข้อมูล | ค้นหา |
|-----------|:----------:|:-----:|
| All       | ✅         | ✅    |
| Media     | ✅         | ❌    |
| Operation | ❌         | ✅    |

ระบบซ่อนแท็บที่ไม่มีสิทธิ์ที่หน้าเว็บ และตรวจสอบสิทธิ์ซ้ำที่ฝั่ง server ทุกครั้งที่กด
บันทึกข้อมูล/ค้นหา (เทียบ username กับ sheet `user_mng` อีกครั้ง) ป้องกันการเรียกฟังก์ชัน
ตรงๆ โดยข้าม UI

> ⚠️ **ข้อควรระวังด้านความปลอดภัย**: การเก็บ password เป็น plain text ใน Google Sheet
> ไม่ปลอดภัยสำหรับใช้งานจริงกับข้อมูลสำคัญ เหมาะกับการใช้งานภายในทีมเล็กๆ เท่านั้น
> ถ้าต้องการความปลอดภัยที่สูงขึ้น แนะนำให้ใช้ Google Workspace SSO
> (ตรวจสอบ `Session.getActiveUser().getEmail()` แทนการมี username/password เอง) แจ้งได้
> ถ้าต้องการให้ปรับเป็นแบบนั้น

## วิธี Deploy

1. สร้าง Google Sheet ใหม่ (หรือใช้ไฟล์ที่มีอยู่แล้ว) — นี่จะเป็นฐานข้อมูล
2. เปิด **Extensions > Apps Script**
3. ลบไฟล์ `Code.gs` เริ่มต้น แล้วสร้างไฟล์ต่อไปนี้ในโปรเจกต์ (ใช้ชื่อไฟล์ให้ตรงกัน):
   - `Code.gs`
   - `Index.html`
   - `Stylesheet.html`
   - `JavaScript.html`
   หลังจาก deploy ครั้งแรก ให้เข้าไปเพิ่มข้อมูลผู้ใช้ใน sheet `user_mng`
   (ดูหัวข้อ "หน้า Login" ด้านบน) ก่อนให้ผู้ใช้จริงเข้าใช้งาน
4. คัดลอกเนื้อหาจากไฟล์ในโฟลเดอร์นี้ไปวางในแต่ละไฟล์ (สำหรับไฟล์ `.html` ให้สร้างเป็น
   HTML file ใน Apps Script editor)
5. เปิด **Project Settings** แล้วอัปเดต manifest (`appsscript.json`) ให้ตรงกับไฟล์
   `appsscript.json` ในโฟลเดอร์นี้ (ต้องเปิด "Show appsscript.json manifest file"
   ใน Project Settings ก่อน)
6. กด **Deploy > New deployment**
   - Select type: **Web app**
   - Execute as: **User accessing the web app** (หรือ Me ถ้าต้องการให้ทุกคนเขียนลง sheet
     เดียวกันโดยไม่ต้องแชร์สิทธิ์ sheet)
   - Who has access: เลือกตามต้องการ (เช่น เฉพาะคนในองค์กร หรือ Anyone)
7. กด Deploy แล้วคัดลอก Web app URL เพื่อใช้งาน

### ใช้ clasp (ทางเลือกสำหรับ deploy ผ่าน CLI)

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Media Records Management"
# คัดลอกไฟล์ในโฟลเดอร์นี้ไปยังโฟลเดอร์โปรเจกต์ที่ clasp สร้าง แล้ว
clasp push
clasp deploy
```

## การปรับแต่งที่อาจต้องทำเพิ่ม

- **Running number แบบ global ทุก type**: แก้ `generateMediaId_` ใน `Code.gs` ให้ไม่เช็ค
  `parts[0] === typeCode` (ดูค่าสูงสุดจากทุกแถวแทน)
- **เพิ่ม/แก้ประเภท Type of Media**: แก้ array `MEDIA_TYPES` ใน `Code.gs`
- **จำกัดสิทธิ์การใช้งาน**: ปรับ `access` ใน `appsscript.json` และตอน deploy
