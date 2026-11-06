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
  ['Phòng thường 1 giường','Phòng tiêu chuẩn có 1 giường lớn, không gian gọn gàng và phù hợp tối đa 2 khách.',2,1200000,['Wifi miễn phí','TV thông minh','Điều hòa']],
  ['Phòng thường 2 giường','Phòng tiêu chuẩn có 2 giường riêng biệt, phù hợp tối đa 4 khách.',4,1500000,['Wifi miễn phí','TV thông minh','Điều hòa']],
  ['Phòng cao cấp 1 giường','Phòng cao cấp với 1 giường king, phù hợp tối đa 2 khách.',2,1800000,['Wifi miễn phí','Ăn sáng','TV thông minh','Bồn tắm']],
  ['Phòng cao cấp 2 giường','Phòng cao cấp với 2 giường, phù hợp tối đa 4 khách.',4,2200000,['Wifi miễn phí','Ăn sáng','TV thông minh','Bồn tắm']],
  ['Phòng gia đình 1 giường lớn','Phòng rộng cho gia đình với 1 giường lớn, phù hợp tối đa 4 khách.',4,2600000,['Wifi miễn phí','Ăn sáng','TV thông minh','Tủ lạnh mini']],
  ['Phòng tập thể 5 giường','Phòng lưu trú nhóm với 5 giường riêng, phù hợp tối đa 5 khách.',5,3500000,['Wifi miễn phí','Điều hòa','Tủ khóa cá nhân']],
  ['Phòng nhóm 5 khách','Phòng nhóm gồm 2 giường đôi và 1 giường đơn, phù hợp tối đa 5 khách.',5,3500000,['Wifi miễn phí','Điều hòa','Tủ khóa cá nhân']],
  ['Phòng nhóm 6 khách','Phòng nhóm gồm 3 giường đôi, phù hợp tối đa 6 khách.',6,4200000,['Wifi miễn phí','Điều hòa','Tủ khóa cá nhân']],
  ['Phòng nhóm 7 khách','Phòng nhóm gồm 3 giường đôi và 1 giường đơn, phù hợp tối đa 7 khách.',7,4900000,['Wifi miễn phí','Điều hòa','Tủ khóa cá nhân']],
  ['Phòng nhóm 8 khách','Phòng nhóm gồm 3 giường đôi và 2 giường đơn, phù hợp tối đa 8 khách.',8,5600000,['Wifi miễn phí','Điều hòa','Tủ khóa cá nhân']]
];

for (const [name,description,capacity,price,amenities] of types) {
  await pool.query(
    `INSERT INTO room_types(name,description,capacity,base_price,amenities)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description,capacity=EXCLUDED.capacity,amenities=EXCLUDED.amenities`,
    [name,description,capacity,price,JSON.stringify(amenities)]
  );
}

await pool.query(`UPDATE room_types SET name='Phòng thường 2 giường',description='Phòng tiêu chuẩn có 2 giường riêng biệt, phù hợp tối đa 4 khách.',capacity=4
  WHERE name='Phòng đôi 2 giường' AND NOT EXISTS (SELECT 1 FROM room_types WHERE name='Phòng thường 2 giường')`);
await pool.query(`UPDATE room_types SET capacity=4,description='Phòng tiêu chuẩn có 2 giường riêng biệt, phù hợp tối đa 4 khách.' WHERE name='Phòng thường 2 giường'`);
await pool.query(`UPDATE rooms SET room_type_id=(SELECT id FROM room_types WHERE name='Phòng thường 2 giường')
  WHERE room_type_id=(SELECT id FROM  WHERE name='Phòng đôi 2 giường')`);
await pool.query(`UPDATE rooms SET room_type_id=(SELECT id FROM room_types WHERE name='Phòng thường 1 giường')
  WHERE room_number='101' AND room_type_id=(SELECT id FROM  WHERE name='Deluxe King')`);
await pool.query(`UPDATE rooms SET room_type_id=(SELECT id FROM room_types WHERE name='Phòng cao cấp 1 giường')
  WHERE room_number='102' AND room_type_id=(SELECT id FROM room_types WHERE name='Deluxe King')`);
await pool.query(`UPDATE rooms SET room_type_id=(SELECT id FROM room_types WHERE name='Phòng thường 2 giường')
  WHERE room_number='201' AND room_type_id=(SELECT id FROM  WHERE name='Premium Suite')`);
await pool.query(`UPDATE rooms SET room_type_id=(SELECT id FROM room_types WHERE name='Phòng cao cấp 2 giường')
  WHERE room_number='202' AND room_type_id=(SELECT id FROM  WHERE name='Premium Suite')`);
await pool.query(`DELETE FROM room_types WHERE name IN ('Phòng đôi 2 giường','Deluxe King','Premium Suite')
  AND NOT EXISTS (SELECT 1 FROM rooms WHERE room_type_id=room_types.id)`);

await pool.query(`UPDATE room_types SET capacity=4,description=regexp_replace(description,'tối đa [0-9]+ khách','tối đa 4 khách','gi')
  WHERE name ILIKE '%2 giường%' OR name ILIKE '%2 giuong%' OR name ILIKE '%2 bed%' OR name ILIKE '%twin%'`);

const typeRows = await pool.query(`SELECT id,name FROM room_types`);
const map = Object.fromEntries(typeRows.rows.map(x => [x.name,x.id]));
<<<<<<< HEAD
const rooms = [['101','Phong thuong 1 giuong'],['102','Phong doi 2 giuong'],['201','Phong cao cap 1 giuong'],['202','Phong cao cap 2 giuong'],['301','Phong gia dinh 1 giuong lon']];
for (const [number,type] of rooms) {
  await pool.query(
    `INSERT INTO rooms(room_number,room_type_id) VALUES($1,$2) ON CONFLICT(room_number) DO NOTHING`,
    [number,map[type]]
  );
=======
const roomPhoto=id=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=85`;
const rooms = [
  ['101','Phòng thường 1 giường'],['102','Phòng cao cấp 1 giường'],['201','Phòng thường 2 giường'],['202','Phòng cao cấp 2 giường'],['301','Phòng gia đình 1 giường lớn'],
  ['501','Phòng nhóm 5 khách',roomPhoto('photo-1578683010236-d716f9a3f461')],
  ['502','Phòng nhóm 6 khách',roomPhoto('photo-1590490360182-c33d57733427')],
  ['103','Phòng nhóm 7 khách',roomPhoto('photo-1564501049412-61c2a3083791')],
  ['302','Phòng nhóm 8 khách',roomPhoto('photo-1582719478250-c89cae4dc85b')]
];
for (const [number,type,image] of rooms) {
  if(image){
    await pool.query(
      `INSERT INTO rooms(room_number,room_type_id,images) VALUES($1,$2,$3)
       ON CONFLICT(room_number) DO UPDATE SET images=EXCLUDED.images WHERE rooms.images='[]'::jsonb`,
      [number,map[type],JSON.stringify([image])]
    );
  } else {
    await pool.query(
      `INSERT INTO rooms(room_number,room_type_id) VALUES($1,$2) ON CONFLICT(room_number) DO NOTHING`,
      [number,map[type]]
    );
  }
>>>>>>> 3262c5b (Cập nhật dự án)
}

const services = [['Dua don san bay','Dua don san bay',350000],['Buffet sang','Buffet sang moi ngay',180000],['Giat say quan ao','Giat va say quan ao',100000],['Do an nhe va nuoc uong trong phong','Do uong va thuc an nhe trong phong',120000],['Nuoc suoi','Nuoc suoi',30000]];
for (const s of services) {
  await pool.query(`INSERT INTO services(name,description,price) VALUES($1,$2,$3) ON CONFLICT(name) DO NOTHING`,s);
}
console.log('Seed completed.');
await pool.end();
