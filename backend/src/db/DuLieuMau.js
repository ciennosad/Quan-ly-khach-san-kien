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
  ['Phòng thường 1 giường','Phòng tiêu chuẩn với 1 giường lớn, phù hợp tối đa 2 khách.',2,1200000,['Wifi miễn phí','TV thông minh','Điều hòa']],
  ['Phòng đôi 2 giường','Phòng có 2 giường đơn riêng biệt, phù hợp tối đa 2 khách.',2,1500000,['Wifi miễn phí','TV thông minh','Điều hòa']],
  ['Phòng cao cấp 1 giường','Phòng cao cấp với 1 giường king, phù hợp tối đa 2 khách.',2,1800000,['Wifi miễn phí','Ăn sáng','TV thông minh','Bồn tắm']],
  ['Phòng cao cấp 2 giường','Phòng cao cấp với 2 giường, phù hợp tối đa 4 khách.',4,2200000,['Wifi miễn phí','Ăn sáng','TV thông minh','Bồn tắm']],
  ['Phòng gia đình 1 giường lớn','Phòng rộng cho gia đình với 1 giường lớn, phù hợp tối đa 4 khách.',4,2600000,['Wifi miễn phí','Ăn sáng','TV thông minh','Tủ lạnh mini']],
  ['Phòng tập thể 5 giường','Phòng lưu trú nhóm với 5 giường riêng, phù hợp tối đa 5 khách.',5,3500000,['Wifi miễn phí','Điều hòa','Tủ khóa cá nhân']]
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
const rooms = [['101','Phòng thường 1 giường'],['102','Phòng đôi 2 giường'],['201','Phòng cao cấp 1 giường'],['202','Phòng cao cấp 2 giường'],['301','Phòng gia đình 1 giường lớn']];
for (const [number,type] of rooms) {
  await pool.query(
    `INSERT INTO rooms(room_number,room_type_id) VALUES($1,$2) ON CONFLICT(room_number) DO NOTHING`,
    [number,map[type]]
  );
}

const services = [['Ăn sáng buffet','Buffet sáng mỗi ngày',180000],['Giặt ủi','Giặt và sấy quần áo',100000],['Đưa đón sân bay','Đưa đón sân bay',350000],['Đồ uống & snack','Đồ uống và snack trong phòng',120000]];
for (const s of services) {
  await pool.query(`INSERT INTO services(name,description,price) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`,s);
}
console.log('Seed completed.');
await pool.end();
