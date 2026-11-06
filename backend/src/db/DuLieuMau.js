import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './KetNoiCSDL.js';

// Chỉ giữ 1 tài khoản Admin để đăng nhập lần đầu — dùng chức năng "Tạo tài khoản"
// trong khu vực Quản lý để tự tạo thêm tài khoản Quản lý/Lễ tân theo nhu cầu thực tế.
const users = [
  ['System Admin','admin@example.com','Admin@12345','ADMIN']
];

for (const [name,email,password,role] of users) {
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users(full_name,email,password_hash,role)
     VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING`,
    [name,email,hash,role]
  );
}

const types = [
  ['Phong thuong 1 giuong','Phong tieu chuan voi 1 giuong lon, phu hop toi da 2 khach.',2,1200000,['Wifi mien phi','Tivi thong minh','Dieu hoa']],
  ['Phong doi 2 giuong','Phong co 2 giuong rieng biet, phu hop toi da 4 khach.',4,1500000,['Wifi mien phi','Tivi thong minh','Dieu hoa']],
  ['Phong cao cap 1 giuong','Phong cao cap voi 1 giuong lon, phu hop toi da 2 khach.',2,1800000,['Wifi mien phi','Bua sang','Tivi thong minh','Bon tam']],
  ['Phong cao cap 2 giuong','Phong cao cap voi 2 giuong, phu hop toi da 4 khach.',4,2200000,['Wifi mien phi','Bua sang','Tivi thong minh','Bon tam']],
  ['Phong gia dinh 1 giuong lon','Phong rong cho gia dinh voi 1 giuong lon, phu hop toi da 4 khach.',4,2600000,['Wifi mien phi','Bua sang','Tivi thong minh','Tu lanh mini']],
  ['Phong tap the 5 giuong','Phong luu tru nhom voi 5 giuong rieng, phu hop toi da 5 khach.',5,3500000,['Wifi mien phi','Dieu hoa','Tu khoa ca nhan']]
];

for (const [name,description,capacity,price,amenities] of types) {
  await pool.query(
    `INSERT INTO room_types(name,description,capacity,base_price,amenities)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description,capacity=EXCLUDED.capacity,amenities=EXCLUDED.amenities`,
    [name,description,capacity,price,JSON.stringify(amenities)]
  );
}

const typeRows = await pool.query(`SELECT id,name FROM room_types`);
const map = Object.fromEntries(typeRows.rows.map(x => [x.name,x.id]));
const rooms = [['101','Phong thuong 1 giuong'],['102','Phong doi 2 giuong'],['201','Phong cao cap 1 giuong'],['202','Phong cao cap 2 giuong'],['301','Phong gia dinh 1 giuong lon']];
for (const [number,type] of rooms) {
  await pool.query(
    `INSERT INTO rooms(room_number,room_type_id) VALUES($1,$2) ON CONFLICT(room_number) DO NOTHING`,
    [number,map[type]]
  );
}

const services = [['Dua don san bay','Dua don san bay',350000],['Buffet sang','Buffet sang moi ngay',180000],['Giat say quan ao','Giat va say quan ao',100000],['Do an nhe va nuoc uong trong phong','Do uong va thuc an nhe trong phong',120000],['Nuoc suoi','Nuoc suoi',30000]];
for (const s of services) {
  await pool.query(`INSERT INTO services(name,description,price) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`,s);
}
console.log('Seed completed.');
await pool.end();
