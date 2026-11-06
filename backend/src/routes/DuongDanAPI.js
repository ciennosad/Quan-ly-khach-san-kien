import {Router} from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import rateLimit from 'express-rate-limit';
import {pool} from '../db/KetNoiCSDL.js';
import {auth,roles} from '../middleware/XacThuc.js';
import {accessToken,refreshToken,randomToken,sha256} from '../utils/BaoMat.js';
import {bookingCode,invoiceTotals} from '../utils/DatPhong.js';
import {sendMail} from '../utils/ThuDienTu.js';
import {answerFromKnowledge,askOpenAI,relevantKnowledge} from '../utils/TroLyAI.js';

export const router=Router();
const uploadsDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../uploads');
fs.mkdirSync(uploadsDir,{recursive:true});
const upload=multer({dest:uploadsDir,limits:{fileSize:5*1024*1024}});

// Tên loại phòng hiển thị luôn bằng tiếng Việt; tên trong DB có thể giữ nguyên để không phá dữ liệu cũ.
const roomTypeLabel=(name,description='')=>{
  const n=`${name||''} ${description||''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const countBeds=value=>[...String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').matchAll(/(\d+)\s*giuong\b/g)].reduce((total,match)=>total+Number(match[1]),0);
  const bedCount=countBeds(name)||countBeds(description);
  if(/phong nhom|group|tap the|dorm/.test(n)) return bedCount?`Phòng nhóm · ${bedCount} giường`:'Phòng nhóm';
  if(/family|gia dinh/.test(n)) return `Phòng gia đình · ${bedCount||1} giường${bedCount===1?' lớn':''}`;
  if(/cao cap|premium|suite|deluxe/.test(n)) return `Phòng cao cấp · ${bedCount||1} giường`;
  if(/standard|phong thuong|single|phong don/.test(n)) return `Phòng thường · ${bedCount||1} giường`;
  if(/twin|double|phong doi/.test(n)) return `Phòng đôi · ${bedCount||2} giường`;
  return name||'Phòng';
};

// Giữ dữ liệu dịch vụ trong database không dấu, chuẩn hóa nội dung trả cho giao diện khách.
const normalizeServiceText=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const serviceNameLabels={
  'dua don san bay':'Đưa đón sân bay',
  'buffet sang':'Buffet sáng',
  'giat say quan ao':'Giặt sấy quần áo',
  'do an nhe va nuoc uong trong phong':'Đồ ăn nhẹ và nước uống trong phòng',
  'nuoc suoi':'Nước suối'
};
const serviceDescriptionLabels={
  'dua don san bay':'Đưa đón sân bay',
  'buffet sang moi ngay':'Buffet sáng mỗi ngày',
  'giat va say quan ao':'Giặt và sấy quần áo',
  'do uong va thuc an nhe trong phong':'Đồ uống và thức ăn nhẹ trong phòng',
  'nuoc suoi cua gia dinh tu sang tao ra':'Nước suối'
};
const serviceForDisplay=service=>({
  ...service,
  name:serviceNameLabels[normalizeServiceText(service?.name)]||service?.name,
  description:serviceDescriptionLabels[normalizeServiceText(service?.description)]||service?.description
});

// Chống brute-force cho các endpoint nhạy cảm (login, đăng ký, quên mật khẩu).
const authLimiter=rateLimit({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false,
  message:{message:'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút'}});
const chatbotLimiter=rateLimit({windowMs:60*1000,max:20,standardHeaders:true,legacyHeaders:false,
  message:{message:'Bạn đã gửi nhiều câu hỏi liên tiếp. Vui lòng đợi một phút rồi thử lại.'}});

const log=async(actor,action,type,id,metadata={})=>{
  await pool.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)`,
    [actor,action,type,id,JSON.stringify(metadata)]);
};

// Thông báo trong ứng dụng — gửi cho 1 người dùng, hoặc cho tất cả người thuộc 1 số vai trò (nhân viên).
async function notify(userId,title,message,link=null){
  if(!userId) return;
  await pool.query(`INSERT INTO notifications(user_id,title,message,link) VALUES($1,$2,$3,$4)`,[userId,title,message,link]);
}
async function notifyRoles(rolesArr,title,message,link=null){
  const r=await pool.query(`SELECT id FROM users WHERE role=ANY($1) AND is_active=true`,[rolesArr]);
  for(const row of r.rows) await notify(row.id,title,message,link);
}

// Lịch ngày đặt phòng: trả về những ngày không còn ít nhất một phòng phù hợp với số khách.
router.get('/availability/calendar',async(req,res,next)=>{
  try{
    const from=String(req.query.from||'').slice(0,10);
    const to=String(req.query.to||'').slice(0,10);
    const guestCount=Number(req.query.guests||1);
    const roomId=String(req.query.roomId||'').trim();
    const checkIn=String(req.query.checkIn||'').slice(0,10);
    const dateRe=/^\d{4}-\d{2}-\d{2}$/;
    const validDate=value=>{if(!dateRe.test(value))return false;const parsed=new Date(value+'T00:00:00Z');return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;};
    const addDays=(value,count)=>new Date(Date.parse(value+'T00:00:00Z')+count*86400000).toISOString().slice(0,10);
    if(!validDate(from)||!validDate(to)) return res.status(400).json({message:'Khoảng ngày không hợp lệ. Cần định dạng YYYY-MM-DD.'});
    if(!Number.isInteger(guestCount)||guestCount<1||guestCount>20) return res.status(400).json({message:'Số khách phải từ 1 đến 20'});
    if(Date.parse(to+'T00:00:00Z')<Date.parse(from+'T00:00:00Z')) return res.status(400).json({message:'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc'});
    if(checkIn&&(!validDate(checkIn)||checkIn<from||checkIn>to)) return res.status(400).json({message:'Ngày nhận phòng không hợp lệ'});
    const daysCount=Math.floor((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000)+1;
    if(daysCount>366) return res.status(400).json({message:'Chỉ được kiểm tra tối đa 366 ngày mỗi lần'});
    const rooms=(await pool.query("SELECT r.id::text AS room_id,r.status,rt.capacity FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE rt.capacity >= $1 AND r.status <> 'MAINTENANCE' AND ($2 = '' OR r.id::text = $2)",[guestCount,roomId])).rows;
    const upperBound=addDays(to,1);
    const bookings=(await pool.query("SELECT b.room_id::text AS room_id,b.check_in,b.check_out FROM bookings b WHERE b.status NOT IN ('CANCELLED','COMPLETED') AND b.check_in < $2::timestamptz AND b.check_out > $1::timestamptz",[from+'T14:00:00+07:00',upperBound+'T12:00:00+07:00'])).rows;
    const todayVN=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
    const roomReady=(room,arrivalDate)=>!(arrivalDate===todayVN&&['OCCUPIED','CLEANING'].includes(room.status));
    const overlaps=(room,start,end)=>bookings.some(b=>String(b.room_id)===String(room.room_id)&&new Date(b.check_in)<end&&new Date(b.check_out)>start);
    const available=[],blocked=[];
    for(let i=0;i<daysCount;i++){
      const day=addDays(from,i);
      const startAt=new Date(day+'T14:00:00+07:00');
      const endAt=new Date(addDays(day,1)+'T12:00:00+07:00');
      const free=startAt>new Date()&&rooms.some(room=>roomReady(room,day)&&!overlaps(room,startAt,endAt));
      if(free) available.push(day); else blocked.push(day);
    }
    const blockedCheckout=[];
    if(checkIn){
      const startAt=new Date(checkIn+'T14:00:00+07:00');
      for(let i=0;i<daysCount;i++){
        const day=addDays(from,i);
        const endAt=new Date(day+'T12:00:00+07:00');
        const free=endAt>startAt&&rooms.some(room=>roomReady(room,checkIn)&&!overlaps(room,startAt,endAt));
        if(!free) blockedCheckout.push(day);
      }
    }
    res.json({from,to,guests:guestCount,available,blocked,blockedCheckout});
  }catch(e){next(e)}
});


// Trợ lý LUXORA: AI chỉ gọi các công cụ đọc dữ liệu được backend cho phép theo vai trò.
router.post('/chatbot',chatbotLimiter,async(req,res,next)=>{
  try{
    const message=String(req.body?.message||'').trim();
    if(!message) return res.status(400).json({message:'Vui lòng nhập câu hỏi.'});
    if(message.length>1500) return res.status(400).json({message:'Câu hỏi tối đa 1.500 ký tự.'});
    const history=Array.isArray(req.body?.history)?req.body.history.slice(-8).map(x=>({role:x?.role==='assistant'?'assistant':'user',content:String(x?.content||'').slice(0,1500)})):[];
    const authHeader=String(req.headers.authorization||'');
    let actor={role:'GUEST',id:null};
    if(authHeader.startsWith('Bearer ')){
      let tokenUser;
      try{tokenUser=jwt.verify(authHeader.slice(7),process.env.JWT_SECRET)}
      catch{return res.status(401).json({message:'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'})}
      const account=(await pool.query(`SELECT id,role,is_active FROM users WHERE id=$1`,[tokenUser.sub])).rows[0];
      if(!account?.is_active) return res.status(401).json({message:'Tài khoản không còn hoạt động.'});
      actor={id:account.id,role:account.role};
    }
    const role=actor.role;
    const allowedStaff=['ADMIN','MANAGER','RECEPTIONIST'];
    const allowedManager=['ADMIN','MANAGER'];
    const validDate=value=>{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return false;
      const d=new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
    };
    const toolSpecs=[
      {type:'function',name:'search_room_availability',description:'Chỉ trả các loại phòng đang trống trong cả khoảng lưu trú có sức chứa đúng bằng số khách yêu cầu; đồng thời lọc theo loại phòng và ngân sách nếu khách cung cấp. Gọi khi khách hỏi phòng trống/giá theo ngày.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{check_in:{type:'string',description:'Ngày nhận YYYY-MM-DD'},check_out:{type:'string',description:'Ngày trả YYYY-MM-DD'},guests:{type:'integer',minimum:1,maximum:20},room_type:{type:['string','null']},max_total:{type:['number','null'],description:'Ngân sách tối đa cho toàn kỳ lưu trú nếu khách nêu'}} ,required:['check_in','check_out','guests','room_type','max_total']}},
      {type:'function',name:'list_services',description:'Lấy danh sách dịch vụ và giá hiện đang bật trong hệ thống.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{},required:[]}}
    ];
    if(allowedStaff.includes(role)) toolSpecs.push(
      {type:'function',name:'find_bookings_by_date',description:'Lễ tân/quản lý/quản trị tra cứu booking check-in/check-out theo ngày. Chỉ trả mã booking, số phòng, loại phòng, ngày giờ, số khách và trạng thái; không lấy tên, email, điện thoại.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{date:{type:'string',description:'Ngày YYYY-MM-DD'},kind:{type:'string',enum:['check_in','check_out','any']}},required:['date','kind']}},
      {type:'function',name:'find_booking_by_code',description:'Nhân viên có quyền tra cứu một booking theo mã để hỗ trợ nghiệp vụ; không trả thông tin liên hệ cá nhân.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{booking_code:{type:'string'}},required:['booking_code']}}
    );
    if(allowedManager.includes(role)) toolSpecs.push(
      {type:'function',name:'get_management_summary',description:'Quản lý/quản trị xem tổng hợp vận hành theo một ngày: tổng số booking nhận/trả, trạng thái phòng và yêu cầu hoàn tiền đang chờ. Chỉ đọc, không duyệt hay cập nhật.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{date:{type:'string',description:'Ngày YYYY-MM-DD'}},required:['date']}}
    );
    if(role==='CUSTOMER') toolSpecs.push(
      {type:'function',name:'find_my_booking',description:'Khách hàng tra cứu booking của chính tài khoản đang đăng nhập bằng mã booking.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{booking_code:{type:'string'}},required:['booking_code']}}
    );
    const executeTool=async(name,args)=>{
      if(name==='search_room_availability'){
        const {check_in:checkIn,check_out:checkOut,guests,room_type:roomType,max_total:maxTotal}=args;
        if(!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn) return {error:'Ngày không hợp lệ. Cần ngày nhận và ngày trả theo YYYY-MM-DD; ngày trả phải sau ngày nhận.'};
        if(!Number.isInteger(guests)||guests<1||guests>20) return {error:'Số khách hợp lệ từ 1 đến 20.'};
        const nights=(Date.parse(`${checkOut}T00:00:00Z`)-Date.parse(`${checkIn}T00:00:00Z`))/86400000;
        if(nights>90) return {error:'Mỗi lần chỉ tra cứu tối đa 90 đêm.'};
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
        if(checkIn<today) return {error:'Ngày nhận phòng đã qua. Hãy hỏi khách chọn ngày khác.'};
        const start=new Date(`${checkIn}T14:00:00+07:00`);
        if(start<=new Date()) return {error:'Đã qua giờ nhận phòng trong ngày này. Hãy hỏi khách chọn ngày khác.'};
        const rows=(await pool.query(`SELECT rt.id,rt.name,rt.description,rt.capacity,rt.base_price,rt.amenities,COUNT(r.id)::int available_count
          FROM room_types rt JOIN rooms r ON r.room_type_id=rt.id
          WHERE rt.capacity = $1 AND ($2='' OR rt.name ILIKE '%'||$2||'%')
            AND r.status <> 'MAINTENANCE'
            AND ($3::date > (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR r.status NOT IN ('OCCUPIED','CLEANING'))
            AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=r.id
              AND b.status NOT IN ('CANCELLED','COMPLETED')
              AND (b.status<>'PENDING_PAYMENT' OR COALESCE(b.payment_expires_at,b.created_at+INTERVAL '15 minutes')>NOW())
              AND b.check_in < (($4::date + TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh')
              AND b.check_out > (($3::date + TIME '14:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'))
          GROUP BY rt.id ORDER BY rt.base_price,rt.name`,[guests,String(roomType||''),checkIn,checkOut])).rows;
        const matches=[];
        for(const room of rows){
          const pricing=await getRoomPricing(pool,room.id,checkIn,checkOut,room.base_price);
          if(maxTotal!=null&&pricing.total>Number(maxTotal)) continue;
          matches.push({name:roomTypeLabel(room.name,room.description),description:room.description||'',capacity:Number(room.capacity),availableCount:Number(room.available_count),totalPrice:pricing.total,nights,nightlyRates:pricing.nightlyRates.map(rate=>({date:rate.date,price:rate.price})),amenities:room.amenities||[]});
        }
        return {checkIn,checkOut,guests,nights,rooms:matches,checkedAt:new Date().toISOString(),message:matches.length?'Đây là kết quả tra cứu hiện tại; chưa giữ phòng.':'Không có loại phòng phù hợp còn trống cho toàn bộ khoảng ngày này.'};
      }
      if(name==='list_services'){
        return {services:(await pool.query(`SELECT name,description,price FROM services WHERE is_active=true ORDER BY name LIMIT 30`)).rows.map(s=>({...serviceForDisplay(s),price:Number(s.price)}))};
      }
      if(name==='find_bookings_by_date'){
        if(!allowedStaff.includes(role)) return {error:'Vai trò hiện tại không được tra cứu danh sách booking nội bộ.'};
        const {date,kind}=args;
        if(!validDate(date)) return {error:'Ngày tra cứu không hợp lệ.'};
        const start=`($1::date AT TIME ZONE 'Asia/Ho_Chi_Minh')`,end=`(($1::date+INTERVAL '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
        const clause=kind==='check_in'?`b.check_in >= ${start} AND b.check_in < ${end}`:kind==='check_out'?`b.check_out >= ${start} AND b.check_out < ${end}`:`((b.check_in >= ${start} AND b.check_in < ${end}) OR (b.check_out >= ${start} AND b.check_out < ${end}))`;
        const bookings=(await pool.query(`SELECT b.booking_code,r.room_number,rt.name room_type,b.check_in,b.check_out,b.guest_count,b.status
          FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id
          WHERE ${clause} AND b.status<>'CANCELLED' AND (b.status<>'PENDING_PAYMENT' OR COALESCE(b.payment_expires_at,b.created_at+INTERVAL '15 minutes')>NOW())
          ORDER BY b.check_in LIMIT 100`,[date])).rows;
        return {date,kind,count:bookings.length,bookings};
      }
      if(name==='find_booking_by_code'||name==='find_my_booking'){
        const selfOnly=name==='find_my_booking';
        if(selfOnly&&(role!=='CUSTOMER'||!actor.id)) return {error:'Khách cần đăng nhập để xem booking của tài khoản mình.'};
        if(!selfOnly&&!allowedStaff.includes(role)) return {error:'Vai trò hiện tại không được tra cứu booking nội bộ.'};
        const bookingCode=String(args.booking_code||'').trim().toUpperCase();
        if(!/^[A-Z0-9-]{5,40}$/.test(bookingCode)) return {error:'Mã booking không đúng định dạng.'};
        const values=[bookingCode],ownerClause=selfOnly?'AND b.customer_id=$2':'';
        if(selfOnly) values.push(actor.id);
        const booking=(await pool.query(`SELECT b.booking_code,r.room_number,rt.name room_type,b.check_in,b.check_out,b.guest_count,b.status,b.room_price,b.deposit_amount
          FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id
          WHERE b.booking_code=$1 ${ownerClause} LIMIT 1`,values)).rows[0];
        return booking?{booking:{...booking,room_price:Number(booking.room_price),deposit_amount:Number(booking.deposit_amount)}}:{message:'Không tìm thấy booking phù hợp hoặc tài khoản không có quyền xem.'};
      }
      if(name==='get_management_summary'){
        if(!allowedManager.includes(role)) return {error:'Chỉ quản lý/quản trị được xem báo cáo vận hành.'};
        const {date}=args;
        if(!validDate(date)) return {error:'Ngày tra cứu không hợp lệ.'};
        const [counts,roomCounts,refunds]=await Promise.all([
          pool.query(`SELECT COUNT(*) FILTER(WHERE check_in >= ($1::date AT TIME ZONE 'Asia/Ho_Chi_Minh') AND check_in < (($1::date+INTERVAL '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh') AND status<>'CANCELLED')::int check_ins,
            COUNT(*) FILTER(WHERE check_out >= ($1::date AT TIME ZONE 'Asia/Ho_Chi_Minh') AND check_out < (($1::date+INTERVAL '1 day') AT TIME ZONE 'Asia/Ho_Chi_Minh') AND status<>'CANCELLED')::int check_outs,
            COUNT(*) FILTER(WHERE status='CHECKED_IN')::int currently_checked_in FROM bookings`,[date]),
          pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='AVAILABLE')::int available,
            COUNT(*) FILTER(WHERE status='OCCUPIED')::int occupied,COUNT(*) FILTER(WHERE status='CLEANING')::int cleaning,
            COUNT(*) FILTER(WHERE status='MAINTENANCE')::int maintenance FROM rooms`),
          pool.query(`SELECT COUNT(*)::int pending FROM payments WHERE type='REFUND' AND status IN ('PENDING','PROCESSING')`)
        ]);
        return {date,bookings:counts.rows[0],rooms:roomCounts.rows[0],pendingRefunds:refunds.rows[0].pending};
      }
      return {error:'Công cụ này không được cấp cho trợ lý.'};
    };
    // Tra cứu ngày/số khách trực tiếp từ CSDL, không phụ thuộc OpenAI để thực hiện tool call.
    const parseChatDate=value=>{
      const text=String(value||'').trim();
      let match=text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
      if(match){const [,d,m,y]=match;return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
      match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if(match){const [,y,m,d]=match;return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
      return null;
    };
    const lastAssistant=history.at(-1);
    const priorUser=[...history].reverse().find(item=>item.role==='user');
    const assistantAskedForDates=lastAssistant?.role==='assistant'&&/ngày nhận phòng/i.test(lastAssistant.content||'')&&/ngày trả phòng/i.test(lastAssistant.content||'');
    const priorUserAskedForRooms=priorUser&&/(\d{1,2})\s*ph[oò]ng\s*(\d{1,2})\s*(?:người|khách)/i.test(priorUser.content||'');
    const currentMessageHasDates=/\b(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{4}-\d{1,2}-\d{1,2})\b/.test(message);
    const isDateFollowUp=assistantAskedForDates||(priorUserAskedForRooms&&currentMessageHasDates);
    const queryMessage=isDateFollowUp&&priorUser?`${priorUser.content} ${message}`:message;
    const dateTokens=[...queryMessage.matchAll(/\b(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}|\d{4}-\d{1,2}-\d{1,2})\b/g)].map(m=>parseChatDate(m[0])).filter(Boolean);
    const guestMatch=queryMessage.match(/(\d{1,2})\s*(?:người|khách)/i);
    const userMessages=[...history.filter(item=>item.role==='user').map(item=>item.content||''),message];
    const datePattern=/\b(?:\d{1,2}[/\.\-]\d{1,2}[/\.\-]\d{4}|\d{4}-\d{1,2}-\d{1,2})\b/g;
    const contextualDates=[...userMessages].reverse().map(value=>[...value.matchAll(datePattern)].map(m=>parseChatDate(m[0])).filter(Boolean)).find(values=>values.length>=2);
    if(contextualDates) dateTokens.splice(0,dateTokens.length,...contextualDates.slice(-2));
    const contextualGuestMatch=guestMatch||[...userMessages].reverse().map(value=>value.match(/(\d{1,2})\s*(?:người|khách)/i)).find(Boolean)||null;
    const normalizedQuestion=message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const asksAvailability=/ph[oò]ng|c[oò]n tr[oố]ng|đặt ph[oò]ng|s[oố] ph[oò]ng/i.test(queryMessage);
    const roomRequests=[...queryMessage.matchAll(/(\d{1,2})\s*ph[oò]ng\s*(\d{1,2})\s*(?:người|khách)/gi)]
      .flatMap(match=>Array.from({length:Math.min(Number(match[1]),10)},()=>Number(match[2])))
      .filter(count=>count>=1&&count<=20);
    const roomTypes=(await pool.query(`SELECT id,name,description,capacity,base_price FROM room_types ORDER BY base_price,name`)).rows;
    const roomTypeLabels=roomTypes.map(type=>({type,label:roomTypeLabel(type.name,type.description),title:roomTypeLabel(type.name,type.description).split(' · ')[0]}));
    const normalizeName=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const exactRoomTypes=roomTypeLabels.filter(({type,label})=>[type.name,label].some(alias=>normalizeName(alias).length>3&&normalizedQuestion.includes(normalizeName(alias))));
    const namedRoomTypes=exactRoomTypes.length?exactRoomTypes:roomTypeLabels.filter(({title})=>normalizeName(title).length>5&&normalizedQuestion.includes(normalizeName(title)));
    const asksRoomPrice=/gia|tong|tien|bao nhieu|chi phi|dat phong/.test(normalizedQuestion);
    const requestedGuests=Number(contextualGuestMatch?.[1]||0);
    const sameCapacityRoomTypes=namedRoomTypes.filter(item=>Number(item.type.capacity)===requestedGuests);
    const quoteRoomTypes=requestedGuests&&sameCapacityRoomTypes.length?sameCapacityRoomTypes:namedRoomTypes;
    if((role==='GUEST'||role==='CUSTOMER')&&quoteRoomTypes.length&&(asksRoomPrice||asksAvailability)){
      if(quoteRoomTypes.length>1) return res.json({answer:'Mình thấy có nhiều hạng phòng cùng nhóm tên này. Bạn cho mình biết số giường hoặc tên loại phòng cụ thể để mình tính đúng nhé?',suggestions:[],aiEnabled:false});
      const selectedType=quoteRoomTypes[0].type;
      const selectedLabel=quoteRoomTypes[0].label;
      const guests=requestedGuests;
      if(!guests) return res.json({answer:`Bạn muốn đặt ${selectedLabel}. Bạn cho mình biết số khách nhé?`,suggestions:[],aiEnabled:false});
      if(dateTokens.length<2) return res.json({answer:`Mình đã ghi nhận ${guests} khách và loại ${selectedLabel}. Bạn cho mình ngày nhận phòng và ngày trả phòng để kiểm tra tình trạng cùng tổng giá chính xác nhé.`,suggestions:[],aiEnabled:false});
      const [checkIn,checkOut]=dateTokens.slice(-2);
      if(!validDate(checkIn)||!validDate(checkOut)||checkOut<=checkIn) return res.json({answer:'Ngày nhận/trả phòng chưa hợp lệ. Bạn gửi lại ngày nhận và ngày trả phòng nhé.',suggestions:[],aiEnabled:false});
      const quote=await executeTool('search_room_availability',{check_in:checkIn,check_out:checkOut,guests,room_type:selectedType.name,max_total:null});
      if(quote.error) return res.json({answer:quote.error,suggestions:[],aiEnabled:false});
      const result=quote.rooms?.find(room=>room.name===selectedLabel);
      if(!result) return res.json({answer:`Mình chưa tìm thấy ${selectedLabel} còn trống, đúng sức chứa ${guests} khách, từ ${checkIn} đến ${checkOut}. Bạn muốn mình kiểm tra loại phòng khác không?`,suggestions:[],aiEnabled:false});
      const nightly=result.nightlyRates.map(rate=>`${rate.date}: ${Number(rate.price).toLocaleString('vi-VN')} ₫`).join('; ');
      return res.json({answer:`Mình đã kiểm tra đúng loại ${result.name} cho ${guests} khách từ ${checkIn} đến ${checkOut} (${result.nights} đêm). Hiện còn ${result.availableCount} phòng phù hợp. Tổng tiền phòng là ${Number(result.totalPrice).toLocaleString('vi-VN')} ₫ (${nightly}). Giá chưa gồm dịch vụ phát sinh và phòng chưa được giữ chỗ.`,suggestions:[],aiEnabled:false});
    }
    if(asksAvailability&&!dateTokens.length&&(roomRequests.length||/ph[oò]ng.*(?:tr[oố]ng|đặt)|(?:tr[oố]ng|đặt).*ph[oò]ng/i.test(queryMessage))){
      const roomText=roomRequests.length?` cho ${roomRequests.length} phòng (${roomRequests.map((count,index)=>`phòng ${index+1}: ${count} khách`).join(', ')})`:'';
      return res.json({answer:`Mình có thể kiểm tra tình trạng${roomText}. Bạn cho mình ngày nhận phòng và ngày trả phòng nhé?`,suggestions:[],aiEnabled:false});
    }
    if(asksAvailability&&dateTokens.length>=2){
      const [checkIn,checkOut]=dateTokens;
      if(roomRequests.length){
        const todayVN=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
        if(checkIn<todayVN||checkOut<todayVN) return res.json({answer:`Khoảng ngày ${checkIn} đến ${checkOut} đã qua (hôm nay là ${todayVN}), nên mình không thể tra tình trạng phòng để đặt. Bạn gửi ngày nhận và ngày trả trong tương lai nhé.`,suggestions:[],aiEnabled:false});
        if(checkOut<=checkIn) return res.json({answer:'Ngày trả phòng phải sau ngày nhận phòng. Bạn gửi lại giúp mình hai ngày nhé.',suggestions:[],aiEnabled:false});
        const nights=(Date.parse(`${checkOut}T00:00:00Z`)-Date.parse(`${checkIn}T00:00:00Z`))/86400000;
        if(nights>90) return res.json({answer:'Mỗi lần mình chỉ tra cứu tối đa 90 đêm. Bạn gửi khoảng ngày ngắn hơn nhé.',suggestions:[],aiEnabled:false});
        const availableRooms=(await pool.query(`SELECT r.id,r.room_number,rt.id room_type_id,rt.name,rt.description,rt.capacity,rt.base_price,rt.amenities
          FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id
          WHERE r.status<>'MAINTENANCE'
            AND ($1::date>(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date OR r.status NOT IN ('OCCUPIED','CLEANING'))
            AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=r.id
              AND b.status NOT IN ('CANCELLED','COMPLETED')
              AND (b.status<>'PENDING_PAYMENT' OR COALESCE(b.payment_expires_at,b.created_at+INTERVAL '15 minutes')>NOW())
              AND b.check_in < (($3::date+TIME '12:00') AT TIME ZONE 'Asia/Ho_Chi_Minh')
              AND b.check_out > (($2::date+TIME '14:00') AT TIME ZONE 'Asia/Ho_Chi_Minh'))
          ORDER BY rt.base_price,r.room_number`,[checkIn,checkIn,checkOut])).rows;
        const assigned=new Set(),assignments=[];
        for(const guestCount of [...roomRequests].sort((a,b)=>b-a)){
          const room=availableRooms.find(candidate=>!assigned.has(String(candidate.id))&&Number(candidate.capacity)===guestCount);
          if(!room){
            const requestSummary=roomRequests.map((count,index)=>`phòng ${index+1} cho ${count} khách`).join(', ');
            return res.json({answer:`Mình chưa tìm được đủ ${roomRequests.length} phòng riêng biệt từ ${checkIn} đến ${checkOut} cho yêu cầu ${requestSummary}. Bạn có thể thử ngày khác hoặc liên hệ lễ tân để kiểm tra phương án gần nhất.`,suggestions:[],aiEnabled:false});
          }
          assigned.add(String(room.id));
          const pricing=await getRoomPricing(pool,room.room_type_id,checkIn,checkOut,room.base_price);
          assignments.push({guestCount,name:roomTypeLabel(room.name,room.description),capacity:Number(room.capacity),total:Number(pricing.total)});
        }
        const assignmentText=assignments.map((room,index)=>`• Phòng ${index+1}: loại ${room.name}, ${room.capacity} khách tối đa, ${room.guestCount} khách; ${room.total.toLocaleString('vi-VN')} ₫ / ${nights} đêm`).join('\n');
        return res.json({answer:`Mình đã kiểm tra ${roomRequests.length} phòng từ ${checkIn} đến ${checkOut}. Có phòng phù hợp cho từng yêu cầu:\n${assignmentText}\n\nKết quả chưa giữ phòng và có thể thay đổi trước khi hoàn tất đặt phòng.`,suggestions:[],aiEnabled:false});
      }
      const guests=guestMatch?Number(guestMatch[1]):null;
      if(!guests) return res.json({answer:'Mình đã nhận được khoảng ngày. Bạn cho mình biết số khách để kiểm tra loại phòng phù hợp nhé.',suggestions:[],aiEnabled:false});
      const todayVN=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
      if(checkIn<todayVN||checkOut<todayVN) return res.json({answer:`Khoảng ngày ${checkIn} đến ${checkOut} đã qua (hôm nay là ${todayVN}), nên mình không thể tra tình trạng phòng để đặt. Bạn gửi ngày nhận và ngày trả trong tương lai nhé.`,suggestions:[],aiEnabled:false});
      const availability=await executeTool('search_room_availability',{check_in:checkIn,check_out:checkOut,guests,room_type:null,max_total:null});
      if(availability.error) return res.json({answer:availability.error,suggestions:[],aiEnabled:false});
      if(!availability.rooms?.length) return res.json({answer:`Mình đã kiểm tra từ ${checkIn} đến ${checkOut} cho ${guests} khách: hiện không có loại phòng đủ sức chứa còn trống suốt khoảng ngày này. Tình trạng có thể thay đổi; bạn có thể thử ngày khác hoặc liên hệ lễ tân.`,suggestions:[],aiEnabled:false});
      const roomLines=availability.rooms.map(room=>`• ${room.name}: còn ${room.availableCount} phòng phù hợp, tối đa ${room.capacity} khách; tổng ${Number(room.totalPrice).toLocaleString('vi-VN')} ₫ cho ${room.nights} đêm`).join('\n');
      return res.json({answer:`Mình đã tra cứu từ ${checkIn} đến ${checkOut} cho ${guests} khách. Các loại phòng còn trống theo dữ liệu hiện tại:\n${roomLines}\n\nKết quả chưa giữ phòng; tình trạng có thể thay đổi trước khi hoàn tất đặt phòng.`,suggestions:[],aiEnabled:false});
    }
    if(process.env.OPENAI_API_KEY){
      try{
        const result=await askOpenAI({message,history,role,knowledge:relevantKnowledge(message,role,history),tools:toolSpecs,runTool:executeTool});
        if(result?.answer) return res.json({answer:result.answer,suggestions:[],aiEnabled:true});
      }catch(error){
        console.error('[CHATBOT_AI]',error.message);
      }
    }
    // Chế độ không tính phí API: dùng câu trả lời đã duyệt trong file kiến thức và dữ liệu hệ thống.
    const q=message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(/lien he|so dien thoai|dien thoai|hotline|email|gmail|contact/.test(q)) return res.json({answer:'Thông tin liên hệ LUXORA HOTEL:\nNgười phụ trách: Dương Đình Kiền\nĐiện thoại: 0379 887 282\nEmail: kienduon757@gmail.com',suggestions:[],aiEnabled:false});
    if(/con phong|phong trong|phong nao|ngay nhan|ngay tra|dat phong tu|tu ngay/.test(q)){
      return res.json({answer:'Mình chưa có đủ thông tin để xác nhận phòng còn trống. Bạn gửi ngày nhận, ngày trả và số khách nhé; nếu đặt nhiều phòng, hãy cho mình biết số khách ở từng phòng. Mình cũng có thể hỗ trợ thông tin chung về phòng, dịch vụ và giờ nhận/trả phòng. Nếu cần kiểm tra ngay, bạn có thể liên hệ lễ tân.',suggestions:[],aiEnabled:false});
    }
    const nums=[...q.matchAll(/\b(\d{1,2})\s*(?:nguoi|khach)\b/g)].map(m=>Number(m[1]));
    const guestCount=nums[0]||null;
    if(/danh sach dich vu|co nhung dich vu|co dich vu gi|dich vu nao|gia dich vu|cac dich vu|dich vu.*(gi|nao|xem|danh sach|gia|loai)/.test(q)){
      const services=(await pool.query(`SELECT name,description,price FROM services WHERE is_active=true ORDER BY name LIMIT 8`)).rows;
      return res.json({answer:services.length?'LUXORA hiện có các dịch vụ sau:':'Hiện hệ thống chưa có dịch vụ nào được bật.',suggestions:services.map(s=>({...serviceForDisplay(s),price:Number(s.price)})),aiEnabled:false});
    }
    if(/nhan phong|tra phong|check.?in|check.?out/.test(q)) return res.json({answer:'LUXORA nhận phòng từ 14:00 và trả phòng tối đa lúc 12:00.',suggestions:[],aiEnabled:false});
    const knowledgeAnswer=answerFromKnowledge(message,role,history);
    if(knowledgeAnswer) return res.json({answer:knowledgeAnswer,suggestions:[],aiEnabled:false});
    if(/dich vu|giat|an sang|spa/.test(q)){
      const services=(await pool.query(`SELECT name,description,price FROM services WHERE is_active=true ORDER BY name LIMIT 8`)).rows;
      return res.json({answer:services.length?'LUXORA hiện có các dịch vụ sau:':'Hiện hệ thống chưa có dịch vụ nào được bật.',suggestions:services.map(s=>({...serviceForDisplay(s),price:Number(s.price)})),aiEnabled:false});
    }
    const rooms=(await pool.query(`SELECT rt.id,rt.name,rt.capacity,rt.base_price,rt.description,rt.amenities FROM room_types rt ORDER BY rt.base_price`)).rows;
    const candidates=rooms.filter(r=>!guestCount||Number(r.capacity)===guestCount);
    if(/phong|gia|nguoi|khach|suc chua/.test(q)) return res.json({answer:process.env.OPENAI_API_KEY?'Mình chưa thể kết nối trợ lý AI lúc này. Vui lòng thử lại sau.':(guestCount?`Với ${guestCount} khách, đây là các loại phòng đủ sức chứa theo dữ liệu hiện có:`:'Đây là các loại phòng và giá cơ bản hiện có:') ,suggestions:candidates.slice(0,8).map(r=>({name:roomTypeLabel(r.name,r.description),capacity:Number(r.capacity),price:Number(r.base_price),description:r.description||'',amenities:r.amenities||[]})),aiEnabled:false});
    res.json({answer:process.env.OPENAI_API_KEY?'Mình chưa thể trả lời chính xác câu hỏi này lúc này. Bạn có thể hỏi về phòng, dịch vụ, giá cơ bản hoặc giờ nhận/trả phòng; nếu cần hỗ trợ đặt phòng, vui lòng liên hệ lễ tân.':'Mình chưa có đủ thông tin để trả lời chính xác câu hỏi này. Hiện mình có thể hỗ trợ thông tin chung về phòng, dịch vụ và giờ nhận/trả phòng. Với yêu cầu đặt phòng cụ thể, bạn vui lòng gửi ngày lưu trú và số khách hoặc liên hệ lễ tân.',suggestions:[],aiEnabled:false});
  }catch(e){next(e)}
});

// Email xác nhận đặt cọc — đầy đủ: mã booking, thông tin khách, phòng, ngày/giờ vào/ra,
// giá phòng, tổng tiền, tiền cọc, số tiền còn lại, trạng thái thanh toán và QR booking.
const vnd=n=>Number(n||0).toLocaleString('vi-VN')+'đ';
const vnDate=d=>d?new Date(d).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short'}):'—';
const paymentTypeLabel=t=>({DEPOSIT:'Tiền cọc',BALANCE:'Thanh toán phần còn lại',REFUND:'Hoàn tiền'}[t]||'Thanh toán');
const paymentStatusLabel=s=>({SUCCESS:'Đã thanh toán',PENDING:'Chờ xác nhận',REJECTED:'Đã từ chối',PROCESSING:'Đang xử lý'}[s]||'Chưa xác định');
const paymentProviderLabel=p=>({BANK_TRANSFER:'Chuyển khoản ngân hàng',CASH:'Tiền mặt',MANUAL:'Thanh toán thủ công',VIETQR:'VietQR'}[p]||'Thanh toán');
const qrMailAttachment=(dataUrl,cid='booking-qr@luxora.hotel')=>({filename:'luxora-booking-qr.png',content:Buffer.from(String(dataUrl).split(',')[1]||'','base64'),contentType:'image/png',cid});
async function sendDepositConfirmationEmail(bookingId){
  const b=(await pool.query(`SELECT b.*,r.room_number,rt.name room_type_name,u.email,u.full_name,u.phone
    FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id
    LEFT JOIN users u ON u.id=b.customer_id WHERE b.id=$1`,[bookingId])).rows[0];
  if(!b||!b.email) return;
  const remaining=Math.max(Number(b.room_price)-Number(b.deposit_amount),0);
  const qr=await QRCode.toDataURL(JSON.stringify({bookingCode:b.booking_code,roomNumber:b.room_number,roomType:b.room_type_name}));
  const html=`<!doctype html><html><body style="margin:0;background:#f3efe7;font-family:Arial,sans-serif;color:#18212b"><div style="max-width:720px;margin:24px auto;background:#fff;border:1px solid #e4ddcf"><div style="padding:28px 32px;background:#18212b;color:#fff"><div style="font-size:11px;letter-spacing:4px;color:#d4b47a">LUXORA HOTEL</div><h1 style="font-family:Georgia,serif;font-weight:400;margin:12px 0 4px">XÁC NHẬN ĐẶT CỌC</h1><div style="font-size:13px;opacity:.8">Booking đã được xác nhận</div></div><div style="padding:30px 32px"><div style="background:#f7f3ea;border:1px solid #e4ddcf;padding:18px 20px;text-align:center;margin-bottom:24px"><div style="font-size:11px;letter-spacing:2px;color:#8b7658">MÃ BOOKING</div><div style="font-size:28px;font-weight:700;letter-spacing:1px;margin-top:7px">${escapeHtml(b.booking_code)}</div></div><p>Xin chào <b>${escapeHtml(b.full_name||'Quý khách')}</b>, cảm ơn bạn đã đặt phòng tại LUXORA HOTEL. Dưới đây là thông tin xác nhận:</p><table width="100%" cellpadding="7" cellspacing="0" style="border-collapse:collapse"><tr><td>Mã booking</td><td><b>${escapeHtml(b.booking_code)}</b></td></tr><tr><td>Khách hàng</td><td>${escapeHtml(b.full_name||'—')} · ${escapeHtml(b.customer_phone||b.phone||'—')}</td></tr><tr><td>Phòng</td><td>Phòng ${escapeHtml(b.room_number)} — ${escapeHtml(roomTypeLabel(b.room_type_name))}</td></tr><tr><td>Ngày giờ nhận phòng</td><td>${vnDate(b.check_in)}</td></tr><tr><td>Ngày giờ trả phòng</td><td>${vnDate(b.check_out)}</td></tr><tr><td>Giá phòng / Tổng tiền tạm tính</td><td>${vnd(b.room_price)}</td></tr><tr><td>Tiền cọc đã thanh toán</td><td><b>${vnd(b.deposit_amount)}</b></td></tr><tr><td>Số tiền còn lại</td><td>${vnd(remaining)}</td></tr><tr><td>Trạng thái thanh toán</td><td><b>Đã đặt cọc — Booking đã được xác nhận</b></td></tr></table><p style="font-size:12px;color:#777;margin-top:28px">Cảm ơn bạn đã lựa chọn LUXORA HOTEL. Đây là email tự động, vui lòng không trả lời email này.</p><div style="margin-top:28px;padding:22px 18px;background:#f7f3ea;border:1px solid #e4ddcf;text-align:center"><div style="font-size:10px;letter-spacing:2px;color:#8b7658">MÃ QR BOOKING</div><div style="font-weight:700;margin:7px 0 14px">Xuất trình mã QR này khi nhận phòng</div><img src="cid:booking-qr@luxora.hotel" alt="Mã QR booking" width="190" height="190" style="display:block;margin:auto"/><div style="font-size:12px;color:#666;margin-top:10px">Booking: <b>${escapeHtml(b.booking_code)}</b> · Phòng <b>${escapeHtml(b.room_number)}</b></div></div></div></div></body></html>`;
  return sendMail({to:b.email,subject:`LUXORA — Xác nhận đặt cọc ${b.booking_code}`,html,attachments:[qrMailAttachment(qr)]});
}


function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
async function sendInvoiceEmail(bookingId, {subjectPrefix='Hóa đơn'}={}){
  const b=(await pool.query(`SELECT b.*,r.room_number,rt.name room_type_name,u.email,u.full_name,u.phone
    FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id
    LEFT JOIN users u ON u.id=b.customer_id WHERE b.id=$1`,[bookingId])).rows[0];
  if(!b?.email) return {skipped:true,reason:'Khách chưa có email'};
  const services=(await pool.query(`SELECT bs.*,s.name FROM booking_services bs JOIN services s ON s.id=bs.service_id WHERE bs.booking_id=$1 AND bs.status NOT IN ('CANCELLED','RESERVED') ORDER BY bs.id`,[bookingId])).rows;
  const serviceTotal=services.reduce((sum,x)=>sum+Number(x.quantity)*Number(x.unit_price),0);
  const saved=(await pool.query(`SELECT * FROM invoices WHERE booking_id=$1`,[bookingId])).rows[0];
  const totals=saved ? {
    roomTotal:Number(saved.room_total),serviceTotal:Number(saved.service_total),surcharge:Number(saved.surcharge),
    depositTotal:Number(saved.deposit_total),grandTotal:Number(saved.grand_total),remainingTotal:Number(saved.remaining_total)
  } : {
    roomTotal:Number(b.room_price),serviceTotal,surcharge:0,depositTotal:Number(b.deposit_amount),
    ...invoiceTotals({room:b.room_price,services:serviceTotal,surcharge:0,deposit:b.deposit_amount})
  };
  const payments=(await pool.query(`SELECT type,amount,status,provider,proof_url,paid_at,created_at FROM payments WHERE booking_id=$1 ORDER BY created_at`,[bookingId])).rows;
  const successfulPaid=payments.filter(x=>x.status==='SUCCESS' && ['DEPOSIT','BALANCE'].includes(x.type)).reduce((sum,x)=>sum+Number(x.amount),0);
  totals.remainingTotal=Math.max(0,Number(totals.grandTotal)-successfulPaid);
  totals.depositTotal=payments.filter(x=>x.status==='SUCCESS' && x.type==='DEPOSIT').reduce((sum,x)=>sum+Number(x.amount),0);
  const serviceRows=services.length ? services.map(x=>`<tr><td>${escapeHtml(x.name)} × ${x.quantity}</td><td style="text-align:right">${vnd(Number(x.quantity)*Number(x.unit_price))}</td></tr>`).join('') : `<tr><td colspan="2" style="color:#777">Không có dịch vụ phát sinh</td></tr>`;
  const paymentRows=payments.length ? payments.map(x=>`<tr><td><b>${paymentTypeLabel(x.type)}</b><br><span style="color:#777;font-size:12px">${paymentProviderLabel(x.provider)}</span></td><td style="text-align:right"><b>${vnd(x.amount)}</b><br><span style="color:#777;font-size:12px">${paymentStatusLabel(x.status)}</span></td></tr>`).join('') : `<tr><td colspan="2" style="color:#777">Chưa có giao dịch thanh toán</td></tr>`;
  const qr=await QRCode.toDataURL(JSON.stringify({bookingCode:b.booking_code,roomNumber:b.room_number,roomType:b.room_type_name}));
  const html=`<!doctype html><html><body style="margin:0;background:#f3efe7;font-family:Arial,sans-serif;color:#18212b"><div style="max-width:720px;margin:24px auto;background:#fff;border:1px solid #e4ddcf"><div style="padding:28px 32px;background:#18212b;color:#fff"><div style="font-size:11px;letter-spacing:4px;color:#d4b47a">LUXORA HOTEL</div><h1 style="font-family:Georgia,serif;font-weight:400;margin:12px 0 4px">HÓA ĐƠN / RECEIPT</h1><div style="font-size:13px;opacity:.8">${escapeHtml(b.booking_code)} · ${escapeHtml(subjectPrefix)}</div></div><div style="padding:30px 32px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><b>${escapeHtml(b.full_name||'Quý khách')}</b><br>${escapeHtml(b.email)}<br>${escapeHtml(b.customer_phone||b.phone||'')}</td><td style="text-align:right">Phòng <b>${escapeHtml(b.room_number)}</b><br>${escapeHtml(roomTypeLabel(b.room_type_name))}<br>${vnDate(b.check_in)} → ${vnDate(b.check_out)}</td></tr></table><hr style="border:0;border-top:1px solid #e5dfd2;margin:24px 0"><table width="100%" cellpadding="8" cellspacing="0"><tr><td>Giá phòng</td><td style="text-align:right">${vnd(totals.roomTotal)}</td></tr>${serviceRows}${totals.surcharge>0?`<tr><td>Phụ phí</td><td style="text-align:right">${vnd(totals.surcharge)}</td></tr>`:''}<tr style="font-size:16px"><td><b>TỔNG CỘNG</b></td><td style="text-align:right"><b>${vnd(totals.grandTotal)}</b></td></tr><tr><td>Đã thanh toán / tiền cọc</td><td style="text-align:right">${vnd(totals.depositTotal)}</td></tr><tr><td><b>Còn phải trả</b></td><td style="text-align:right"><b>${vnd(totals.remainingTotal)}</b></td></tr></table><h3 style="font-family:Georgia,serif;font-weight:500;margin-top:28px">Lịch sử thanh toán</h3><table width="100%" cellpadding="7" cellspacing="0" style="font-size:13px">${paymentRows}</table><p style="font-size:12px;color:#777;margin-top:28px">Cảm ơn bạn đã lựa chọn LUXORA HOTEL. Đây là email tự động, vui lòng không trả lời email này.</p><div style="margin-top:28px;padding:22px 18px;background:#f7f3ea;border:1px solid #e4ddcf;text-align:center"><div style="font-size:10px;letter-spacing:2px;color:#8b7658">MÃ QR BOOKING</div><div style="font-weight:700;margin:7px 0 14px">Xuất trình mã QR này khi nhận phòng</div><img src="cid:booking-qr@luxora.hotel" width="190" height="190" alt="Mã QR booking" style="display:block;margin:auto"><div style="font-size:12px;color:#666;margin-top:10px">Booking: <b>${escapeHtml(b.booking_code)}</b> · Phòng <b>${escapeHtml(b.room_number)}</b></div></div></div></div></body></html>`;
  return sendMail({to:b.email,subject:`LUXORA — ${subjectPrefix} ${b.booking_code}`,html,attachments:[qrMailAttachment(qr)]});
}

async function sendWelcomeEmail(user){
  if(!user?.email) return;
  return sendMail({to:user.email,subject:'LUXORA HOTEL — Chào mừng bạn',html:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:32px;background:#f7f3ea;color:#18212b"><div style="background:#fff;padding:30px;border:1px solid #e5dfd2"><div style="letter-spacing:3px;font-size:11px;color:#b08d57">LUXORA HOTEL</div><h1 style="font-family:Georgia,serif;font-weight:500">Chào mừng ${escapeHtml(user.full_name||'bạn')}.</h1><p>Tài khoản của bạn đã được tạo thành công với email <b>${escapeHtml(user.email)}</b>.</p><p>Bạn có thể đăng nhập để đặt phòng, theo dõi booking và nhận hóa đơn điện tử.</p><a href="${process.env.CLIENT_URL||'http://localhost:5173'}" style="display:inline-block;padding:13px 20px;background:#18212b;color:#fff;text-decoration:none">Mở LUXORA</a></div></div>`});
}

router.post('/auth/register',authLimiter,async(req,res,next)=>{
  try{
    const {fullName,email,phone,password}=req.body;
    const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'');
    if(!fullName||!emailOk||!password||password.length<8) return res.status(400).json({message:'Thông tin đăng ký chưa hợp lệ (kiểm tra lại email và mật khẩu tối thiểu 8 ký tự)'});
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query(`INSERT INTO users(full_name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,full_name,email,phone,role`,
      [fullName,email.toLowerCase(),phone||null,hash]);
    res.status(201).json(r.rows[0]);
    sendWelcomeEmail(r.rows[0]).catch(err=>console.error('[MAIL] Không gửi được email chào mừng:',err.message));
  }catch(e){next(e)}
});

router.post('/auth/login',authLimiter,async(req,res,next)=>{
  try{
    const {email,password}=req.body;
    const r=await pool.query(`SELECT * FROM users WHERE email=$1`,[email?.toLowerCase()]);
    const u=r.rows[0];
    if(!u||!u.is_active||!(await bcrypt.compare(password||'',u.password_hash))) return res.status(401).json({message:'Email hoặc mật khẩu không đúng'});
    const at=accessToken(u),rt=refreshToken(u);
    await pool.query(`INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`,
      [u.id,sha256(rt)]);
    res.json({accessToken:at,refreshToken:rt,user:{id:u.id,fullName:u.full_name,email:u.email,role:u.role}});
  }catch(e){next(e)}
});

router.post('/auth/refresh',async(req,res,next)=>{
  try{
    const {refreshToken:rt}=req.body;
    const payload=jwt.verify(rt,process.env.JWT_REFRESH_SECRET);
    const check=await pool.query(`SELECT 1 FROM refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()`,[sha256(rt)]);
    if(!check.rowCount) return res.status(401).json({message:'Refresh token không hợp lệ'});
    const u=(await pool.query(`SELECT * FROM users WHERE id=$1 AND is_active=true`,[payload.sub])).rows[0];
    if(!u) return res.status(401).json({message:'Tài khoản không hoạt động'});
    await pool.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`,[sha256(rt)]);
    const newRt=refreshToken(u);
    await pool.query(`INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`,[u.id,sha256(newRt)]);
    res.json({accessToken:accessToken(u),refreshToken:newRt});
  }catch(e){res.status(401).json({message:'Refresh token hết hạn'})}
});

router.post('/auth/logout',auth,async(req,res,next)=>{
  try{
    const {refreshToken:rt}=req.body||{};
    if(rt) await pool.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND token_hash=$2`,[req.user.sub,sha256(rt)]);
    else await pool.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`,[req.user.sub]);
    res.json({message:'Đã đăng xuất'});
  }catch(e){next(e)}
});

router.post('/auth/forgot-password',authLimiter,async(req,res,next)=>{
  try{
    const {email}=req.body;
    const u=(await pool.query(`SELECT * FROM users WHERE email=$1`,[email?.toLowerCase()])).rows[0];
    // Không tiết lộ email có tồn tại hay không.
    if(u){
      const raw=randomToken();
      await pool.query(`INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 minutes')`,
        [u.id,sha256(raw)]);
      const link=`${process.env.CLIENT_URL}/reset-password?token=${raw}`;
      await sendMail({to:u.email,subject:'LUXORA — Đặt lại mật khẩu',html:`<p>Bạn đã yêu cầu đặt lại mật khẩu.</p><p><a href="${link}">Đặt lại mật khẩu</a></p><p>Link có hiệu lực 30 phút và chỉ dùng một lần.</p>`});
    }
    res.json({message:'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.'});
  }catch(e){next(e)}
});

router.post('/auth/reset-password',async(req,res,next)=>{
  try{
    const {token,password}=req.body;
    if(!token||!password||password.length<8) return res.status(400).json({message:'Mật khẩu mới phải có ít nhất 8 ký tự'});
    const q=await pool.query(`SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW()`,[sha256(token)]);
    if(!q.rowCount) return res.status(400).json({message:'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'});
    const hash=await bcrypt.hash(password,12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,q.rows[0].user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1',[q.rows[0].id]);
    await pool.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1',[q.rows[0].user_id]);
    res.json({message:'Đổi mật khẩu thành công'});
  }catch(e){next(e)}
});

// Đổi mật khẩu khi đang đăng nhập (mọi vai trò).
router.post('/auth/change-password',auth,async(req,res,next)=>{
  try{
    const {currentPassword,newPassword}=req.body;
    if(!newPassword||newPassword.length<8) return res.status(400).json({message:'Mật khẩu mới phải có ít nhất 8 ký tự'});
    const u=(await pool.query(`SELECT * FROM users WHERE id=$1`,[req.user.sub])).rows[0];
    if(!u||!(await bcrypt.compare(currentPassword||'',u.password_hash))) return res.status(400).json({message:'Mật khẩu hiện tại không đúng'});
    const hash=await bcrypt.hash(newPassword,12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,u.id]);
    await pool.query('UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1',[u.id]);
    await log(u.id,'PASSWORD_CHANGED','USER',u.id);
    res.json({message:'Đổi mật khẩu thành công'});
  }catch(e){next(e)}
});

async function expirePaymentHoldIfNeeded(bookingId){
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const b=(await c.query(`SELECT * FROM bookings WHERE id=$1 FOR UPDATE`,[bookingId])).rows[0];
    if(!b){ await c.query('ROLLBACK'); return {expired:false,booking:null}; }
    const expiresAt=b.payment_expires_at || new Date(new Date(b.created_at).getTime()+15*60*1000);
    if(b.status==='PENDING_PAYMENT' && new Date(expiresAt)<=new Date()){
      await c.query(`UPDATE payments SET status='EXPIRED' WHERE booking_id=$1 AND type='DEPOSIT' AND status='PENDING'`,[b.id]);
      const updated=(await c.query(`UPDATE bookings SET status='CANCELLED',cancellation_reason='Hết thời hạn thanh toán cọc 15 phút' WHERE id=$1 AND status='PENDING_PAYMENT' RETURNING *`,[b.id])).rows[0];
      await c.query(`INSERT INTO notifications(user_id,title,message,link) VALUES($1,$2,$3,$4)`,[
        b.customer_id,'Giữ phòng đã hết hạn',`Booking ${b.booking_code} đã hết thời hạn 15 phút để thanh toán cọc nên hệ thống đã hủy giữ phòng. Bạn có thể đặt lại nếu vẫn có nhu cầu.`,'/account'
      ]);
      await c.query('COMMIT');
      return {expired:true,booking:updated};
    }
    await c.query('COMMIT');
    return {expired:false,booking:b,expiresAt};
  }catch(e){ await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

async function getRoomPricing(db, roomTypeId, checkIn, checkOut, fallbackPrice) {
  const from = String(checkIn).slice(0,10);
  const to = String(checkOut).slice(0,10);
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
    throw new Error('Khoảng ngày tính giá không hợp lệ');
  }
  const specials = (await db.query(`SELECT id,name,date_from,date_to,price
    FROM special_room_prices
    WHERE room_type_id=$1 AND is_active=true
      AND date_from <= $3::date AND date_to >= $2::date
    ORDER BY date_from,id`, [roomTypeId, from, to])).rows;
  const nightlyRates=[];
  let total=0;
  for(let d=new Date(fromDate); d<toDate; d.setUTCDate(d.getUTCDate()+1)){
    const day=d.toISOString().slice(0,10);
    const special=specials.find(x=>String(x.date_from).slice(0,10)<=day && String(x.date_to).slice(0,10)>=day);
    const price=special?Number(special.price):Number(fallbackPrice);
    total+=price;
    nightlyRates.push({date:day,price,isSpecial:!!special,specialName:special?.name||null});
  }
  return {total,nightlyRates};
}

router.get('/rooms/:id/pricing',async(req,res,next)=>{
  try{
    const {checkIn,checkOut}=req.query;
    if(!checkIn||!checkOut) return res.status(400).json({message:'Thiếu ngày nhận và ngày trả phòng'});
    const room=(await pool.query(`SELECT r.id,rt.id room_type_id,rt.base_price
      FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.id=$1`,[req.params.id])).rows[0];
    if(!room) return res.status(404).json({message:'Không tìm thấy phòng'});
    const pricing=await getRoomPricing(pool,room.room_type_id,checkIn,checkOut,room.base_price);
    res.json({roomId:room.id,basePrice:Number(room.base_price),...pricing});
  }catch(e){next(e)}
});

router.get('/rooms',async(req,res,next)=>{
  try{
    const {checkIn,checkOut,guests}=req.query;
    if(Boolean(checkIn)!==Boolean(checkOut)) return res.status(400).json({message:'Vui lòng truyền đủ ngày nhận và ngày trả phòng'});
    const params=[];
    const where=[];
    if(guests){
      const guestCount=Number(guests);
      if(!Number.isInteger(guestCount)||guestCount<1||guestCount>20) return res.status(400).json({message:'Số khách phải từ 1 đến 20'});
      params.push(guestCount);
      where.push(`rt.capacity >= $${params.length}`);
    }
    if(checkIn&&checkOut){
      const inDate=new Date(checkIn),outDate=new Date(checkOut);
      if(Number.isNaN(inDate.getTime())||Number.isNaN(outDate.getTime())||inDate>=outDate) return res.status(400).json({message:'Khoảng thời gian tìm phòng không hợp lệ'});
      params.push(checkIn,checkOut);
      where.push(`r.id NOT IN (SELECT room_id FROM bookings WHERE status NOT IN ('CANCELLED','COMPLETED') AND check_in < $${params.length} AND check_out > $${params.length-1})`);
    }
    const whereSql=where.length?`AND ${where.join(' AND ')}`:'';
    const r=await pool.query(`SELECT r.*,rt.name room_type_name,rt.description,rt.capacity,rt.base_price,rt.amenities,
      COALESCE((SELECT json_agg(json_build_object('checkIn',bb.check_in,'checkOut',bb.check_out) ORDER BY bb.check_in)
        FROM bookings bb WHERE bb.room_id=r.id AND bb.status NOT IN ('CANCELLED','COMPLETED') AND bb.check_out>NOW()),'[]'::json) AS upcoming_bookings
      FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE 1=1 ${whereSql} ORDER BY r.room_number`,params);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.get('/services',async(req,res,next)=>{
  try{res.json((await pool.query(`SELECT * FROM services WHERE is_active=true ORDER BY name`)).rows.map(serviceForDisplay))}
  catch(e){next(e)}
});

// Khách hàng thêm dịch vụ vào booking của chính mình. Giá được chốt tại thời điểm đặt dịch vụ.
router.post('/bookings/:code/services',auth,roles('CUSTOMER'),async(req,res,next)=>{
  try{
    const {serviceId,quantity=1}=req.body;
    const qty=Number(quantity);
    if(!serviceId||!Number.isInteger(qty)||qty<1||qty>50) return res.status(400).json({message:'Dịch vụ hoặc số lượng không hợp lệ'});
    const b=(await pool.query(`SELECT b.* FROM bookings b WHERE b.booking_code=$1 AND b.customer_id=$2`,[req.params.code,req.user.sub])).rows[0];
    if(!b) return res.status(404).json({message:'Không tìm thấy booking của bạn'});
    if(!['CONFIRMED','CHECKED_IN'].includes(b.status)) return res.status(400).json({message:'Chỉ có thể đặt dịch vụ khi booking đã được xác nhận hoặc đang lưu trú'});
    if(new Date(b.check_out)<=new Date()) return res.status(400).json({message:'Booking đã hết thời gian sử dụng dịch vụ'});
    const service=(await pool.query(`SELECT * FROM services WHERE id=$1 AND is_active=true`,[serviceId])).rows[0];
    if(!service) return res.status(404).json({message:'Dịch vụ không tồn tại hoặc đã tạm ngưng'});
    const serviceStatus=b.status==='CHECKED_IN'?'PENDING':'RESERVED';
    const r=await pool.query(`INSERT INTO booking_services(booking_id,service_id,quantity,unit_price,status) VALUES($1,$2,$3,$4,$5) RETURNING *`,[b.id,serviceId,qty,service.price,serviceStatus]);
    await log(req.user.sub,'SERVICE_ADDED','BOOKING',b.id,{serviceId,quantity:qty,unitPrice:service.price,source:'CUSTOMER'});
    await notifyRoles(['RECEPTIONIST','MANAGER','ADMIN'],'Khách đặt thêm dịch vụ',`Booking ${b.booking_code} vừa đặt ${service.name} × ${qty}.`,'/reception');
    res.status(201).json({...r.rows[0],name:service.name});
  }catch(e){next(e)}
});

// Lễ tân chỉnh sửa dịch vụ trong hóa đơn theo mã booking. Dịch vụ chưa sử dụng có thể sửa/xóa; đã sử dụng chỉ điều chỉnh qua trạng thái.
router.patch('/reception/invoices/:code/services/:serviceBookingId',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {quantity,status,reason=''}=req.body;
    const b=(await pool.query(`SELECT id,booking_code,status FROM bookings WHERE booking_code=$1`,[req.params.code])).rows[0];
    if(!b) return res.status(404).json({message:'Không tìm thấy booking'});
    if(['COMPLETED','CANCELLED'].includes(b.status)) return res.status(409).json({message:'Hóa đơn đã chốt hoặc booking đã hủy, không thể sửa trực tiếp'});
    const current=(await pool.query(`SELECT bs.*,s.name FROM booking_services bs JOIN services s ON s.id=bs.service_id WHERE bs.id=$1 AND bs.booking_id=$2`,[req.params.serviceBookingId,b.id])).rows[0];
    if(!current) return res.status(404).json({message:'Không tìm thấy dịch vụ trong booking'});
    let q=quantity==null?Number(current.quantity):Number(quantity);
    if(status==='CANCELLED'||q===0){
      const r=await pool.query(`UPDATE booking_services SET status='CANCELLED',cancelled_at=NOW(),cancelled_by=$1 WHERE id=$2 AND booking_id=$3 RETURNING *`,[req.user.sub,current.id,b.id]);
      if(!r.rows[0]) return res.status(404).json({message:'Không tìm thấy dịch vụ cần bỏ'});
      // Không để lỗi ghi nhật ký phụ làm thất bại thao tác cập nhật hóa đơn.
      try { await log(req.user.sub,'SERVICE_CANCELLED','BOOKING',b.id,{serviceId:current.service_id,bookingServiceId:current.id,reason:reason||'Khách không sử dụng dịch vụ'}); } catch(logError) { console.error('Không ghi được nhật ký hủy dịch vụ:',logError.message); }
      return res.json(r.rows[0]);
    }
    if(!Number.isInteger(q)||q<1||q>50) return res.status(400).json({message:'Số lượng dịch vụ không hợp lệ'});
    // Chỉ cập nhật số lượng; giữ nguyên trạng thái dịch vụ và tránh cập nhật cột thời gian không liên quan.
    const r=await pool.query(`UPDATE booking_services SET quantity=$1 WHERE id=$2 AND booking_id=$3 AND status<>'CANCELLED' RETURNING *`,[q,current.id,b.id]);
    if(!r.rows[0]) return res.status(409).json({message:'Dịch vụ đã bị hủy hoặc không còn khả dụng'});
    try { await log(req.user.sub,'SERVICE_UPDATED_IN_INVOICE','BOOKING',b.id,{bookingServiceId:current.id,oldQuantity:current.quantity,newQuantity:q,status:current.status,reason}); } catch(logError) { console.error('Không ghi được nhật ký cập nhật dịch vụ:',logError.message); }
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.get('/admin/services',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{res.json((await pool.query(`SELECT * FROM services ORDER BY is_active DESC,name`)).rows)}catch(e){next(e)}
});
router.post('/admin/services',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {name,description='',price=0}=req.body; const amount=Number(price);
    if(!name?.trim()||!Number.isFinite(amount)||amount<0) return res.status(400).json({message:'Tên hoặc giá dịch vụ không hợp lệ'});
    const r=await pool.query(`INSERT INTO services(name,description,price,is_active) VALUES($1,$2,$3,true) RETURNING *`,[name.trim(),description?.trim()||null,amount]);
    await log(req.user.sub,'SERVICE_CREATED','SERVICE',r.rows[0].id,{name:r.rows[0].name,price:r.rows[0].price});
    res.status(201).json(r.rows[0]);
  }catch(e){ if(e.code==='23505') return res.status(409).json({message:'Tên dịch vụ đã tồn tại'}); next(e) }
});
router.patch('/admin/services/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {name,description,price,isActive}=req.body; const amount=price==null?null:Number(price);
    if(amount!=null&&(!Number.isFinite(amount)||amount<0)) return res.status(400).json({message:'Giá dịch vụ không hợp lệ'});
    const r=await pool.query(`UPDATE services SET name=COALESCE($1,name),description=COALESCE($2,description),price=COALESCE($3,price),is_active=COALESCE($4,is_active) WHERE id=$5 RETURNING *`,[name?.trim()||null,description===undefined?null:(description?.trim()||null),amount,isActive===undefined?null:Boolean(isActive),req.params.id]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy dịch vụ'});
    await log(req.user.sub,'SERVICE_UPDATED','SERVICE',req.params.id,req.body); res.json(r.rows[0]);
  }catch(e){ if(e.code==='23505') return res.status(409).json({message:'Tên dịch vụ đã tồn tại'}); next(e) }
});
router.delete('/admin/services/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{ const r=await pool.query(`UPDATE services SET is_active=false WHERE id=$1 RETURNING *`,[req.params.id]); if(!r.rowCount)return res.status(404).json({message:'Không tìm thấy dịch vụ'}); await log(req.user.sub,'SERVICE_DISABLED','SERVICE',req.params.id); res.json(r.rows[0]); }catch(e){next(e)}
});

router.post('/bookings',auth,async(req,res,next)=>{
  const c=await pool.connect();
  try{
    const {roomId,checkIn,checkOut,depositAmount=0,discountCode,guests=1,paymentMethod='BANK_TRANSFER',customerPhone,services:requestedServices=[]}=req.body;
    const customer=(await c.query(`SELECT phone FROM users WHERE id=$1`,[req.user.sub])).rows[0];
    const normalizedPhone=String(customerPhone||customer?.phone||'').trim();
    if(!normalizedPhone) return res.status(400).json({message:'Vui lòng nhập số điện thoại để hoàn tất đặt phòng'});
    if(!/^(?:\+84|0)\d{8,10}$/.test(normalizedPhone.replace(/[ .-]/g,''))) return res.status(400).json({message:'Số điện thoại không hợp lệ'});
    if(!roomId||!checkIn||!checkOut) return res.status(400).json({message:'Thiếu thông tin đặt phòng'});
    const inDate=new Date(checkIn),outDate=new Date(checkOut);
    if(!Array.isArray(requestedServices)||requestedServices.length>30) return res.status(400).json({message:'Danh sách dịch vụ không hợp lệ'});
    const requestedServiceIds=new Set();
    for(const item of requestedServices){
      const qty=Number(item?.quantity);
      if(!item?.serviceId||!Number.isInteger(qty)||qty<1||qty>50||requestedServiceIds.has(String(item.serviceId))) return res.status(400).json({message:'Dịch vụ hoặc số lượng không hợp lệ'});
      requestedServiceIds.add(String(item.serviceId));
    }
    if(Number.isNaN(inDate.getTime())||Number.isNaN(outDate.getTime())||inDate>=outDate) return res.status(400).json({message:'Ngày giờ trả phòng phải sau ngày giờ nhận phòng'});
    // Quy định LUXORA: nhận phòng lúc 14:00, trả phòng tối đa 12:00. Số đêm quyết định ngày checkout.
    const inText=String(checkIn), outText=String(checkOut);
    const inTime=inText.match(/T(\d{2}):(\d{2})/), outTime=outText.match(/T(\d{2}):(\d{2})/);
    if(!inTime||!outTime||inTime[1]!=='14'||inTime[2]!=='00'||outTime[1]!=='12'||outTime[2]!=='00') return res.status(400).json({message:'Giờ nhận phòng cố định 14:00 và giờ trả phòng tối đa 12:00.'});
    if(inDate<new Date()) return res.status(400).json({message:'Ngày nhận phòng không được ở trong quá khứ'});
    const guestCount=Number(guests);
    if(!Number.isInteger(guestCount)||guestCount<1||guestCount>20) return res.status(400).json({message:'Số khách phải từ 1 đến 20'});
    // LUXORA: tiền cọc cố định 10% tổng tiền phòng sau giảm giá.
    const requestedDeposit=Number(depositAmount);
    if(!Number.isFinite(requestedDeposit)||requestedDeposit<0) return res.status(400).json({message:'Tiền cọc không hợp lệ'});
    const nights=Math.ceil((outDate-inDate)/(24*60*60*1000));
    if(nights<1) return res.status(400).json({message:'Thời gian lưu trú phải ít nhất 1 đêm'});
    await c.query('BEGIN');
    const room=(await c.query(`SELECT r.*,rt.base_price,rt.name,rt.capacity FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.id=$1 FOR UPDATE`,[roomId])).rows[0];
    if(!room){await c.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy phòng'})}
    const requestedDate=inDate.toISOString().slice(0,10); const todayDate=new Date().toISOString().slice(0,10);
    if(room.status==='MAINTENANCE'){await c.query('ROLLBACK');return res.status(409).json({message:'Phòng đang bảo trì, không thể đặt trong thời gian này'})}
    if(room.status==='CLEANING' && requestedDate===todayDate){await c.query('ROLLBACK');return res.status(409).json({message:'Phòng đang dọn, chưa sẵn sàng cho ngày nhận phòng này'})}
    if(guestCount>Number(room.capacity)){await c.query('ROLLBACK');return res.status(400).json({message:`Phòng này chỉ phục vụ tối đa ${room.capacity} khách`})}
    const conflict=await c.query(`SELECT id FROM bookings WHERE room_id=$1 AND status NOT IN ('CANCELLED','COMPLETED') AND check_in<$3 AND check_out>$2 FOR UPDATE`,[roomId,checkIn,checkOut]);
    if(conflict.rowCount){await c.query('ROLLBACK');return res.status(409).json({message:'Phòng đã được đặt trong khoảng thời gian này'})}
    const roomPricing=await getRoomPricing(c,room.room_type_id,checkIn,checkOut,room.base_price);
    const baseTotal=roomPricing.total;
    let finalPrice=baseTotal,discountAmount=0,appliedCode=null;
    if(discountCode?.trim()){
      const d=(await c.query(`SELECT * FROM discount_codes WHERE code=$1 FOR UPDATE`,[discountCode.trim().toUpperCase()])).rows[0];
      if(!d||!d.is_active) {await c.query('ROLLBACK');return res.status(400).json({message:'Mã giảm giá không tồn tại hoặc đã ngừng áp dụng'})}
      if(d.valid_from&&new Date(d.valid_from)>new Date()){await c.query('ROLLBACK');return res.status(400).json({message:'Mã giảm giá chưa đến thời gian áp dụng'})}
      if(d.valid_to&&new Date(d.valid_to)<new Date()){await c.query('ROLLBACK');return res.status(400).json({message:'Mã giảm giá đã hết hạn'})}
      if(d.max_uses!=null&&d.used_count>=d.max_uses){await c.query('ROLLBACK');return res.status(400).json({message:'Mã giảm giá đã hết lượt sử dụng'})}
      discountAmount=d.percent_off?Math.round(baseTotal*d.percent_off/100):Math.min(baseTotal,Number(d.amount_off||0));
      finalPrice=Math.max(0,baseTotal-discountAmount);
      appliedCode=d.code;
      await c.query(`UPDATE discount_codes SET used_count=used_count+1 WHERE id=$1`,[d.id]);
    }
    const deposit=Math.round(finalPrice*0.10);
    if(!['CASH','BANK_TRANSFER'].includes(paymentMethod)) {await c.query('ROLLBACK');return res.status(400).json({message:'Phương thức thanh toán tiền cọc không hợp lệ'})}
    const code=bookingCode(),raw=randomToken();
    const paymentExpiresAt=deposit>0?new Date(Date.now()+15*60*1000):null;
    const b=(await c.query(`INSERT INTO bookings(booking_code,customer_id,room_id,check_in,check_out,room_price,deposit_amount,guest_count,customer_phone,status,qr_token_hash,discount_code,discount_amount,payment_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [code,req.user.sub,roomId,checkIn,checkOut,finalPrice,deposit,guestCount,normalizedPhone,deposit>0?'PENDING_PAYMENT':'CONFIRMED',sha256(raw),appliedCode,discountAmount,paymentExpiresAt])).rows[0];
    const reservedServices=[];
    for(const item of requestedServices){
      const service=(await c.query(`SELECT id,name,price FROM services WHERE id=$1 AND is_active=true`,[item.serviceId])).rows[0];
      if(!service){await c.query('ROLLBACK');return res.status(400).json({message:'Có dịch vụ không còn khả dụng. Vui lòng tải lại danh sách dịch vụ.'});}
      const saved=(await c.query(`INSERT INTO booking_services(booking_id,service_id,quantity,unit_price,status) VALUES($1,$2,$3,$4,'RESERVED') RETURNING *`,[b.id,service.id,Number(item.quantity),service.price])).rows[0];
      reservedServices.push({...saved,name:service.name});
    }
    if(deposit>0){
      await c.query(`INSERT INTO payments(booking_id,transaction_code,amount,type,status,provider,expires_at) VALUES($1,$2,$3,'DEPOSIT','PENDING',$4,$5)`,
        [b.id,`DEPOSIT-${code}-${Date.now()}`,deposit,paymentMethod,paymentExpiresAt]);
    }
    await log(req.user.sub,'BOOKING_CREATED','BOOKING',b.id,{bookingCode:code,nights,guestCount,baseTotal,discountCode:appliedCode,discountAmount,paymentMethod,reservedServices:reservedServices.length});
    await c.query('COMMIT');
    const qr=await QRCode.toDataURL(JSON.stringify({bookingCode:code,token:raw}));
    res.status(201).json({booking:b,services:reservedServices,qrDataUrl:qr,pricing:{nights,nightlyRate:Number(room.base_price),baseTotal,discountAmount,finalPrice,deposit,remaining:Math.max(0,finalPrice-deposit),guestCount,nightlyRates:roomPricing.nightlyRates,paymentExpiresAt:b.payment_expires_at}});
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}
});

router.get('/bookings/mine',auth,async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT b.*,r.room_number,rt.name room_type_name
      FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id
      WHERE b.customer_id=$1 ORDER BY b.created_at DESC`,[req.user.sub]);
    res.json(r.rows)
  }catch(e){next(e)}
});

// Chính sách hủy: chỉ hủy được khi chưa check-in và chưa quá giờ nhận phòng.
// Nếu đã đặt cọc, tạo sẵn một khoản hoàn tiền ở trạng thái PENDING để Lễ tân/Admin xử lý.
router.post('/bookings/:code/cancel',auth,async(req,res,next)=>{
  const c=await pool.connect();
  try{
    const {reason}=req.body;
    await c.query('BEGIN');
    const b=(await c.query(`SELECT * FROM bookings WHERE booking_code=$1 FOR UPDATE`,[req.params.code])).rows[0];
    if(!b){await c.query('ROLLBACK');return res.status(404).json({message:'Booking không tồn tại'})}
    const isOwner=b.customer_id===req.user.sub;
    const isStaff=['ADMIN','MANAGER'].includes(req.user.role);
    if(!isOwner&&!isStaff){await c.query('ROLLBACK');return res.status(403).json({message:'Bạn không có quyền hủy booking này'})}
    if(!['PENDING_PAYMENT','CONFIRMED'].includes(b.status)){await c.query('ROLLBACK');return res.status(400).json({message:'Booking này không còn ở trạng thái có thể hủy'})}
    if(new Date(b.check_in)<=new Date()&&!isStaff){await c.query('ROLLBACK');return res.status(400).json({message:'Đã quá giờ nhận phòng, vui lòng liên hệ lễ tân để hủy'})}
    const updated=(await c.query(`UPDATE bookings SET status='CANCELLED',cancellation_reason=$1 WHERE id=$2 RETURNING *`,[reason||'Khách hủy booking',b.id])).rows[0];
    if(Number(b.deposit_amount)>0){
      const paid=await c.query(`SELECT COALESCE(SUM(amount),0) total FROM payments WHERE booking_id=$1 AND type='DEPOSIT' AND status='SUCCESS'`,[b.id]);
      if(Number(paid.rows[0].total)>0){
        await c.query(`INSERT INTO payments(booking_id,transaction_code,amount,type,status,provider) VALUES($1,$2,$3,'REFUND','PENDING','MANUAL')`,
          [b.id,`REFUND-${b.booking_code}-${Date.now()}`,paid.rows[0].total]);
      }
    }
    await log(req.user.sub,'BOOKING_CANCELLED','BOOKING',b.id,{reason});
    await c.query('COMMIT');
    res.json(updated);
    await notifyRoles(['ADMIN','MANAGER'],'Booking bị hủy',`Booking ${b.booking_code} đã bị hủy${Number(b.deposit_amount)>0?' — có khoản cọc cần xem xét hoàn tiền':''}.`,'/admin');
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}
});

// Chỉnh sửa hồ sơ cá nhân (họ tên, SĐT, địa chỉ) — không cho đổi email/role tại đây.
router.patch('/account/profile',auth,async(req,res,next)=>{
  try{
    const {fullName,phone,address}=req.body;
    if(!fullName||!fullName.trim()) return res.status(400).json({message:'Họ tên không được để trống'});
    const r=await pool.query(`UPDATE users SET full_name=$1,phone=$2,address=$3 WHERE id=$4
      RETURNING id,full_name,email,phone,address,role,is_active,id_card_number,id_card_front_url,id_card_back_url,kyc_status,kyc_note,created_at`,
      [fullName.trim(),phone||null,address||null,req.user.sub]);
    await log(req.user.sub,'PROFILE_UPDATED','USER',req.user.sub);
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.get('/account/profile',auth,async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT id,full_name,email,phone,address,role,is_active,id_card_number,id_card_front_url,id_card_back_url,kyc_status,kyc_note,created_at FROM users WHERE id=$1`,[req.user.sub]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy tài khoản'});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

// ---------- Thông tin nhận hoàn tiền của khách ----------
// Khách chỉ cung cấp thông tin nhận tiền khi booking phát sinh hoàn tiền.
// Thông tin được lưu trong raw_payload của khoản REFUND, không đưa vào hồ sơ chung.
router.get('/bookings/:code/refund',auth,async(req,res,next)=>{
  try{
    const b=(await pool.query(`SELECT id,booking_code,customer_id FROM bookings WHERE booking_code=$1`,[req.params.code])).rows[0];
    // Booking cũ/stale có thể còn xuất hiện ở giao diện sau khi dữ liệu được thay đổi.
    // Với GET thông tin hoàn tiền, trả về trạng thái rỗng thay vì 404 để trang tài khoản
    // không tạo lỗi Console không cần thiết. Endpoint cập nhật vẫn giữ 404 để báo đúng nghiệp vụ.
    if(!b) return res.json({exists:false,bookingCode:req.params.code,amount:0,status:null,refund:{},createdAt:null});
    if(b.customer_id!==req.user.sub&&!['ADMIN','MANAGER'].includes(req.user.role)) return res.status(403).json({message:'Không có quyền truy cập'});
    const r=(await pool.query(`SELECT id,amount,status,raw_payload,created_at FROM payments WHERE booking_id=$1 AND type='REFUND' ORDER BY created_at DESC LIMIT 1`,[b.id])).rows[0];
    if(!r) return res.json({exists:false,bookingCode:b.booking_code,amount:0,status:null,refund:{},createdAt:null});
    res.json({exists:true,id:r.id,bookingCode:b.booking_code,amount:Number(r.amount),status:r.status,refund:r.raw_payload||{},createdAt:r.created_at});
  }catch(e){next(e)}
});

router.patch('/bookings/:code/refund-recipient',auth,async(req,res,next)=>{
  try{
    const {method='BANK_TRANSFER',bankCode='',bankAccount='',accountName=''}=req.body;
    if(!['BANK_TRANSFER','CASH'].includes(method)) return res.status(400).json({message:'Phương thức nhận hoàn tiền không hợp lệ'});
    const b=(await pool.query(`SELECT id,booking_code,customer_id FROM bookings WHERE booking_code=$1`,[req.params.code])).rows[0];
    if(!b) return res.status(404).json({message:'Booking không tồn tại'});
    if(b.customer_id!==req.user.sub) return res.status(403).json({message:'Bạn không có quyền cập nhật yêu cầu hoàn tiền này'});
    const current=(await pool.query(`SELECT id,status,raw_payload FROM payments WHERE booking_id=$1 AND type='REFUND' ORDER BY created_at DESC LIMIT 1`,[b.id])).rows[0];
    if(!current) return res.status(404).json({message:'Booking chưa có yêu cầu hoàn tiền'});
    if(!['PENDING','REJECTED'].includes(current.status)) return res.status(409).json({message:'Yêu cầu hoàn tiền đã được xử lý; không thể sửa thông tin nhận tiền'});
    if(method==='BANK_TRANSFER'){
      if(!bankCode||!bankAccount||!accountName) return res.status(400).json({message:'Vui lòng nhập ngân hàng, số tài khoản và tên chủ tài khoản'});
      if(!/^\d{6,30}$/.test(String(bankAccount).trim())) return res.status(400).json({message:'Số tài khoản ngân hàng không hợp lệ'});
    }
    const refund={...(current.raw_payload||{}),refundMethod:method};
    if(method==='BANK_TRANSFER') Object.assign(refund,{refundBankCode:String(bankCode).trim().toUpperCase(),refundBankAccount:String(bankAccount).trim(),refundAccountName:String(accountName).trim().toUpperCase()});
    else delete refund.refundBankCode, delete refund.refundBankAccount, delete refund.refundAccountName;
    const nextStatus=current.status==='REJECTED'?'PENDING':current.status;
    const r=await pool.query(`UPDATE payments SET status=$1,raw_payload=$2::jsonb WHERE id=$3::uuid AND type='REFUND' AND status IN ('PENDING','REJECTED') RETURNING id,amount,status,raw_payload`,[nextStatus,JSON.stringify(refund),current.id]);
    if(!r.rowCount) return res.status(409).json({message:'Yêu cầu hoàn tiền vừa được xử lý'});
    await log(req.user.sub,'REFUND_RECIPIENT_UPDATED','PAYMENT',current.id,{method,bankCode:refund.refundBankCode||null});
    res.json({id:r.rows[0].id,amount:Number(r.rows[0].amount),status:r.rows[0].status,refund:r.rows[0].raw_payload||{}});
  }catch(e){next(e)}
});

// Khách gửi ảnh CCCD để xác thực danh tính (KYC). Nhân viên sẽ xem và duyệt thủ công —
// không tự động xác thực OCR (tránh phụ thuộc dịch vụ eKYC trả phí của bên thứ 3).
router.post('/account/kyc',auth,upload.fields([{name:'idFront',maxCount:1},{name:'idBack',maxCount:1}]),async(req,res,next)=>{
  try{
    const {idCardNumber}=req.body;
    if(!idCardNumber||!/^\d{9,12}$/.test(idCardNumber)) return res.status(400).json({message:'Số CCCD/CMND không hợp lệ'});
    const front=req.files?.idFront?.[0], back=req.files?.idBack?.[0];
    if(!front||!back) return res.status(400).json({message:'Vui lòng tải lên đủ ảnh mặt trước và mặt sau CCCD'});
    const r=await pool.query(`UPDATE users SET id_card_number=$1,id_card_front_url=$2,id_card_back_url=$3,kyc_status='PENDING',kyc_note=NULL
      WHERE id=$4 RETURNING id,full_name,email,id_card_number,id_card_front_url,id_card_back_url,kyc_status`,
      [idCardNumber,`/uploads/${front.filename}`,`/uploads/${back.filename}`,req.user.sub]);
    await log(req.user.sub,'KYC_SUBMITTED','USER',req.user.sub);
    await notifyRoles(['ADMIN','MANAGER','RECEPTIONIST'],'Có hồ sơ CCCD cần duyệt',`${r.rows[0].full_name} vừa gửi ảnh CCCD để xác thực.`,'/reception');
    res.status(201).json(r.rows[0]);
  }catch(e){next(e)}
});

// Nhân viên lễ tân/quản lý/admin xem và duyệt hồ sơ CCCD đang chờ xác thực.
router.get('/admin/kyc/pending',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT id,full_name,email,phone,id_card_number,id_card_front_url,id_card_back_url,kyc_status
      FROM users WHERE kyc_status='PENDING' ORDER BY created_at ASC`);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.post('/admin/kyc/:userId/review',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {status,note}=req.body; // VERIFIED | REJECTED
    if(!['VERIFIED','REJECTED'].includes(status)) return res.status(400).json({message:'Trạng thái không hợp lệ'});
    const r=await pool.query(`UPDATE users SET kyc_status=$1,kyc_note=$2 WHERE id=$3 AND kyc_status='PENDING'
      RETURNING id,full_name,kyc_status,kyc_note`,[status,note||null,req.params.userId]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy hồ sơ KYC đang chờ duyệt'});
    await log(req.user.sub,'KYC_'+status,'USER',req.params.userId,{note});
    await notify(req.params.userId,status==='VERIFIED'?'CCCD đã được xác thực':'CCCD bị từ chối',
      status==='VERIFIED'?'Hồ sơ CCCD của bạn đã được xác thực thành công.':`Hồ sơ CCCD bị từ chối${note?': '+note:''}.`,'/account');
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

// Sinh mã VietQR thật (API công khai của VietQR.io, không cần đăng ký) để khách chuyển khoản đặt cọc.
router.get('/bookings/:code/vietqr',auth,async(req,res,next)=>{
  try{
    const b=(await pool.query(`SELECT * FROM bookings WHERE booking_code=$1`,[req.params.code])).rows[0];
    if(!b) return res.status(404).json({message:'Booking không tồn tại'});
    if(b.customer_id!==req.user.sub&&!['ADMIN','MANAGER','RECEPTIONIST'].includes(req.user.role))
      return res.status(403).json({message:'Không có quyền truy cập'});
    if(b.status==='PENDING_PAYMENT'){
      const hold=await expirePaymentHoldIfNeeded(b.id);
      if(hold.expired) return res.status(410).json({message:'Thời hạn giữ phòng 15 phút đã hết. Booking đã được hủy, vui lòng đặt lại phòng.'});
      b.payment_expires_at=hold.expiresAt||b.payment_expires_at;
    }
    const settings=(await pool.query(`SELECT bank_code,bank_account,bank_account_name FROM hotel_settings WHERE id=true`)).rows[0]||{};
    const bankCode=settings.bank_code||process.env.BANK_CODE||'VCB',account=settings.bank_account||process.env.BANK_ACCOUNT||'',name=settings.bank_account_name||process.env.BANK_ACCOUNT_NAME||'LUXORA HOTEL';
    if(!account) return res.status(400).json({message:'Khách sạn chưa cấu hình số tài khoản nhận chuyển khoản. Vui lòng liên hệ quản trị viên.'});
    let amount=Math.round(Number(b.deposit_amount));
    let paymentLabel='DAT COC';
    if(req.query.type==='BALANCE'){
      const serviceTotal=Number((await pool.query(`SELECT COALESCE(SUM(quantity*unit_price) FILTER (WHERE status NOT IN ('CANCELLED','RESERVED')),0) total FROM booking_services WHERE booking_id=$1`,[b.id])).rows[0].total||0);
      amount=Math.max(0,Math.round(invoiceTotals({room:b.room_price,services:serviceTotal,surcharge:0,deposit:b.deposit_amount}).remainingTotal));
      paymentLabel='THANH TOAN';
    }
    if(amount<=0) return res.status(400).json({message:'Không có số tiền cần chuyển khoản cho booking này'});
    const addInfo=encodeURIComponent(`${b.booking_code} ${paymentLabel}`);
    const url=`https://img.vietqr.io/image/${bankCode}-${account}-compact2.png?amount=${amount}&addInfo=${addInfo}&accountName=${encodeURIComponent(name)}`;
    res.json({url,bankCode,account,accountName:name,amount,bookingCode:b.booking_code,paymentLabel});
  }catch(e){next(e)}
});

// Khách tải lên biên lai/ảnh chuyển khoản làm minh chứng. KHÔNG tự động xác nhận thành công —
// chỉ tạo khoản thanh toán ở trạng thái PENDING để nhân viên đối chiếu và xác nhận thủ công.
router.post('/bookings/:code/payment-proof',auth,upload.single('proof'),async(req,res,next)=>{
  try{
    if(!req.file) return res.status(400).json({message:'Vui lòng chọn ảnh biên lai chuyển khoản'});
    const b=(await pool.query(`SELECT * FROM bookings WHERE booking_code=$1`,[req.params.code])).rows[0];
    if(!b) return res.status(404).json({message:'Booking không tồn tại'});
    if(b.customer_id!==req.user.sub) return res.status(403).json({message:'Không có quyền truy cập booking này'});
    if(b.status==='PENDING_PAYMENT'){
      const hold=await expirePaymentHoldIfNeeded(b.id);
      if(hold.expired) return res.status(410).json({message:'Thời hạn thanh toán cọc 15 phút đã hết. Booking đã được hủy, vui lòng đặt lại phòng.'});
      b.payment_expires_at=hold.expiresAt||b.payment_expires_at;
    }
    if(!['PENDING_PAYMENT','CHECKED_IN'].includes(b.status)) return res.status(400).json({message:'Booking không ở trạng thái chờ thanh toán'});
    const type=b.status==='PENDING_PAYMENT'?'DEPOSIT':'BALANCE';
    // Số tiền cần thanh toán còn lại (BALANCE) trước đây bị để cứng = 0 — sửa lại tính đúng
    // theo công thức hóa đơn (tiền phòng + dịch vụ đã dùng - tiền cọc đã trả), để biên lai
    // khách gửi lên khớp đúng số tiền thực tế phải thu, nhân viên đối chiếu mới chính xác.
    let amount=b.deposit_amount;
    if(type==='BALANCE'){
      const s=(await pool.query(`SELECT COALESCE(SUM(quantity*unit_price) FILTER (WHERE status NOT IN ('CANCELLED','RESERVED')),0) total FROM booking_services WHERE booking_id=$1`,[b.id])).rows[0].total;
      amount=invoiceTotals({room:b.room_price,services:s,surcharge:0,deposit:b.deposit_amount}).remainingTotal;
    }
    const proofUrl=`/uploads/${req.file.filename}`;
    const existing=await pool.query(`SELECT id FROM payments WHERE booking_id=$1 AND type=$2 AND status='PENDING' ORDER BY created_at DESC LIMIT 1`,[b.id,type]);
    let payment;
    if(existing.rowCount){
      payment=(await pool.query(`UPDATE payments SET proof_url=$1,amount=$2,provider='BANK_TRANSFER' WHERE id=$3 RETURNING *`,[proofUrl,amount,existing.rows[0].id])).rows[0];
    }else{
      payment=(await pool.query(`INSERT INTO payments(booking_id,transaction_code,amount,type,status,provider,proof_url)
        VALUES($1,$2,$3,$4,'PENDING','BANK_TRANSFER',$5) RETURNING *`,
        [b.id,`PROOF-${b.booking_code}-${Date.now()}`,amount,type,proofUrl])).rows[0];
    }
    await log(req.user.sub,'PAYMENT_PROOF_UPLOADED','PAYMENT',payment.id,{bookingCode:b.booking_code});
    await notifyRoles(['ADMIN','RECEPTIONIST'],'Có biên lai chuyển khoản mới',`Booking ${b.booking_code} vừa gửi biên lai chuyển khoản, cần đối chiếu và xác nhận.`,'/reception');
    res.status(201).json(payment);
  }catch(e){next(e)}
});

// Khách chọn phương thức thanh toán cho số tiền còn lại (tiền mặt tại quầy / chuyển khoản) —
// chỉ dùng để KHAI BÁO trước, hệ thống lưu lại thành 1 khoản PENDING để nhân viên lễ tân đối
// chiếu và xác nhận (giống luồng đặt cọc). Không tự động coi là đã thanh toán thành công.
// Quản trị viên có thể xuất báo cáo /admin/reports/payments hoặc /admin/export/bookings.csv
// để kiểm tra lại các khoản này (cột "provider" ghi rõ CASH hoặc BANK_TRANSFER).
router.post('/bookings/:code/payment-method',auth,async(req,res,next)=>{
  try{
    const {method}=req.body; // CASH | BANK_TRANSFER
    if(!['CASH','BANK_TRANSFER'].includes(method)) return res.status(400).json({message:'Phương thức thanh toán không hợp lệ'});
    const b=(await pool.query(`SELECT * FROM bookings WHERE booking_code=$1`,[req.params.code])).rows[0];
    if(!b) return res.status(404).json({message:'Booking không tồn tại'});
    if(b.customer_id!==req.user.sub) return res.status(403).json({message:'Không có quyền truy cập booking này'});
    if(b.status==='PENDING_PAYMENT'){
      const hold=await expirePaymentHoldIfNeeded(b.id);
      if(hold.expired) return res.status(410).json({message:'Thời hạn thanh toán cọc 15 phút đã hết. Booking đã được hủy, vui lòng đặt lại phòng.'});
      b.payment_expires_at=hold.expiresAt||b.payment_expires_at;
    }

    // Cho phép khách đóng tab sau khi thấy QR rồi quay lại booking để chọn lại phương thức.
    // Không tạo thêm payment DEPOSIT nếu payment PENDING đã tồn tại từ lúc đặt phòng.
    if(b.status==='PENDING_PAYMENT'){
      const pending=(await pool.query(`SELECT * FROM payments WHERE booking_id=$1 AND type='DEPOSIT' AND status='PENDING' ORDER BY created_at DESC LIMIT 1`,[b.id])).rows[0];
      const amount=Number(b.deposit_amount||0);
      if(amount<=0) return res.status(400).json({message:'Booking này không có khoản cọc cần thanh toán'});
      let payment;
      if(pending){
        payment=(await pool.query(`UPDATE payments SET provider=$1 WHERE id=$2 RETURNING *`,[method,pending.id])).rows[0];
      }else{
        payment=(await pool.query(`INSERT INTO payments(booking_id,transaction_code,amount,type,status,provider)
          VALUES($1,$2,$3,'DEPOSIT','PENDING',$4,$5) RETURNING *`,
          [b.id,`METHOD-${b.booking_code}-${Date.now()}`,amount,method,b.payment_expires_at])).rows[0];
      }
      await log(req.user.sub,'DEPOSIT_PAYMENT_METHOD_SELECTED','PAYMENT',payment.id,{bookingCode:b.booking_code,method});
      await notifyRoles(['ADMIN','RECEPTIONIST'],'Khách chọn phương thức thanh toán cọc',
        `Booking ${b.booking_code} đã chọn ${method==='CASH'?'tiền mặt tại quầy':'chuyển khoản'} cho tiền cọc ${amount.toLocaleString('vi-VN')}đ, đang chờ xác nhận.`,'/reception');
      return res.status(201).json(payment);
    }

    if(!['CONFIRMED','CHECKED_IN','COMPLETED'].includes(b.status)) return res.status(400).json({message:'Booking chưa ở trạng thái có thể thanh toán'});
    const s=(await pool.query(`SELECT COALESCE(SUM(quantity*unit_price) FILTER (WHERE status NOT IN ('CANCELLED','RESERVED')),0) total FROM booking_services WHERE booking_id=$1`,[b.id])).rows[0].total;
    const savedInvoice=b.status==='COMPLETED'?(await pool.query('SELECT grand_total FROM invoices WHERE booking_id=$1',[b.id])).rows[0]:null;
    const grandTotal=savedInvoice ? Number(savedInvoice.grand_total) : Number(b.room_price)+Number(s);
    const successfulPayments=await pool.query(
      "SELECT COALESCE(SUM(amount),0) total FROM payments WHERE booking_id=$1 AND type IN ('DEPOSIT','BALANCE') AND status='SUCCESS'",
      [b.id]
    );
    const remaining=Math.max(0,grandTotal-Number(successfulPayments.rows[0].total||0));
    if(remaining<=0) return res.status(400).json({message:'Booking này không còn khoản nào phải thanh toán thêm'});
    const already=await pool.query(`SELECT id FROM payments WHERE booking_id=$1 AND type='BALANCE' AND status IN ('PENDING','SUCCESS')`,[b.id]);
    if(already.rowCount) return res.status(409).json({message:'Bạn đã khai báo/thanh toán khoản còn lại này rồi, vui lòng chờ nhân viên xác nhận'});
    const payment=(await pool.query(`INSERT INTO payments(booking_id,transaction_code,amount,type,status,provider)
      VALUES($1,$2,$3,'BALANCE','PENDING',$4) RETURNING *`,
      [b.id,`METHOD-${b.booking_code}-${Date.now()}`,remaining,method])).rows[0];
    await log(req.user.sub,'PAYMENT_METHOD_SELECTED','PAYMENT',payment.id,{bookingCode:b.booking_code,method});
    await notifyRoles(['ADMIN','RECEPTIONIST'],'Khách gửi yêu cầu thanh toán',
      `Booking ${b.booking_code} đã gửi yêu cầu thanh toán ${method==='CASH'?'tiền mặt tại quầy':'chuyển khoản'} cho số tiền còn lại ${remaining}đ, đang chờ lễ tân duyệt.`,'/reception');
    res.status(201).json(payment);
  }catch(e){next(e)}
});

// Hóa đơn chi tiết của 1 booking: phòng, dịch vụ đã dùng, các khoản đã thanh toán (cọc/còn lại/hoàn tiền),
// và tổng kết (nếu đã check-out thì lấy từ bảng invoices, chưa thì tính tạm thời).
// Danh sách hóa đơn của các booking đang lưu trú; không đưa booking đã trả phòng/hủy vào danh sách.
router.get('/reception/invoices/active',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT b.id,b.booking_code,b.check_in,b.check_out,b.actual_check_in,
      b.room_price,b.deposit_amount,b.customer_phone,r.room_number,u.full_name
      FROM bookings b JOIN rooms r ON r.id=b.room_id LEFT JOIN users u ON u.id=b.customer_id
      WHERE b.status='CHECKED_IN' ORDER BY r.room_number,b.actual_check_in DESC NULLS LAST`);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.get('/bookings/:code/invoice',auth,async(req,res,next)=>{
  try{
    const b=(await pool.query(`SELECT b.*,r.room_number,rt.name room_type_name FROM bookings b
      JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id WHERE b.booking_code=$1`,[req.params.code])).rows[0];
    if(!b) return res.status(404).json({message:'Booking không tồn tại'});
    const isOwner=b.customer_id===req.user.sub;
    const isStaff=['ADMIN','MANAGER','RECEPTIONIST'].includes(req.user.role);
    if(!isOwner&&!isStaff) return res.status(403).json({message:'Bạn không có quyền xem hóa đơn này'});
    const services=(await pool.query(`SELECT bs.*,s.name FROM booking_services bs JOIN services s ON s.id=bs.service_id WHERE booking_id=$1 AND bs.status NOT IN ('CANCELLED','RESERVED') ORDER BY bs.id`,[b.id])).rows;
    const plannedServices=(await pool.query(`SELECT bs.*,s.name FROM booking_services bs JOIN services s ON s.id=bs.service_id WHERE booking_id=$1 AND bs.status='RESERVED' ORDER BY bs.id`,[b.id])).rows;
    const serviceTotal=services.reduce((s,x)=>s+Number(x.quantity)*Number(x.unit_price),0);
    const payments=(await pool.query(`SELECT id,transaction_code,amount,type,status,provider,proof_url,paid_at,created_at FROM payments WHERE booking_id=$1 ORDER BY created_at ASC`,[b.id])).rows;
    const savedInvoiceRow=(await pool.query(`SELECT * FROM invoices WHERE booking_id=$1`,[b.id])).rows[0];
    const savedInvoice=b.status==='COMPLETED'?savedInvoiceRow:null;
    const totals=savedInvoice?{
      roomTotal:Number(savedInvoice.room_total),serviceTotal:Number(savedInvoice.service_total),
      surcharge:Number(savedInvoice.surcharge),depositTotal:Number(savedInvoice.deposit_total),
      grandTotal:Number(savedInvoice.grand_total),remainingTotal:Number(savedInvoice.remaining_total)
    }:{
      roomTotal:Number(b.room_price),serviceTotal,surcharge:0,depositTotal:Number(b.deposit_amount),
      ...invoiceTotals({room:b.room_price,services:serviceTotal,surcharge:0,deposit:b.deposit_amount})
    };
    const successfulPayments=payments.filter(x=>x.status==='SUCCESS' && ['DEPOSIT','BALANCE'].includes(x.type));
    totals.remainingTotal=Math.max(0,Number(totals.grandTotal)-successfulPayments.reduce((sum,x)=>sum+Number(x.amount),0));
    totals.depositTotal=successfulPayments.filter(x=>x.type==='DEPOSIT').reduce((sum,x)=>sum+Number(x.amount),0);
    res.json({booking:b,services,plannedServices,payments,invoice:totals,finalized:!!savedInvoice});
  }catch(e){next(e)}
});

router.post('/bookings/:code/review',auth,async(req,res,next)=>{
  try{
    const {rating,comment}=req.body;
    if(!rating||rating<1||rating>5) return res.status(400).json({message:'Đánh giá phải từ 1 đến 5 sao'});
    const b=(await pool.query(`SELECT * FROM bookings WHERE booking_code=$1`,[req.params.code])).rows[0];
    if(!b) return res.status(404).json({message:'Booking không tồn tại'});
    if(b.customer_id!==req.user.sub) return res.status(403).json({message:'Bạn không có quyền đánh giá booking này'});
    if(b.status!=='COMPLETED') return res.status(400).json({message:'Chỉ có thể đánh giá sau khi đã trả phòng'});
    const r=await pool.query(`INSERT INTO reviews(booking_id,customer_id,room_id,rating,comment) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(booking_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment RETURNING *`,
      [b.id,req.user.sub,b.room_id,rating,comment||null]);
    res.status(201).json(r.rows[0]);
  }catch(e){next(e)}
});

router.get('/rooms/:id/reviews',async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT rv.rating,rv.comment,rv.created_at,u.full_name FROM reviews rv
      LEFT JOIN users u ON u.id=rv.customer_id WHERE rv.room_id=$1 ORDER BY rv.created_at DESC`,[req.params.id]);
    const avg=await pool.query(`SELECT COALESCE(AVG(rating),0)::numeric(10,1) avg,COUNT(*)::int total FROM reviews WHERE room_id=$1`,[req.params.id]);
    res.json({reviews:r.rows,average:avg.rows[0].avg,total:avg.rows[0].total});
  }catch(e){next(e)}
});

router.get('/bookings/:code',auth,async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT b.*,r.room_number,rt.name room_type_name,u.full_name,u.email,u.phone
      FROM bookings b JOIN rooms r ON r.id=b.room_id JOIN room_types rt ON rt.id=r.room_type_id
      LEFT JOIN users u ON u.id=b.customer_id WHERE b.booking_code=$1`,[req.params.code]);
    if(!r.rowCount)return res.status(404).json({message:'Booking không tồn tại'});
    const isOwner=r.rows[0].customer_id===req.user.sub;
    const isStaff=['ADMIN','MANAGER','RECEPTIONIST'].includes(req.user.role);
    if(!isOwner&&!isStaff) return res.status(403).json({message:'Bạn không có quyền xem booking này'});
    const services=await pool.query(`SELECT bs.*,s.name FROM booking_services bs JOIN services s ON s.id=bs.service_id WHERE booking_id=$1`,[r.rows[0].id]);
    res.json({...r.rows[0],services:services.rows});
  }catch(e){next(e)}
});

router.post('/reception/qr-verify',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {bookingCode,token}=req.body;
    const b=(await pool.query(`SELECT * FROM bookings WHERE booking_code=$1`,[bookingCode])).rows[0];
    if(!b||sha256(token||'')!==b.qr_token_hash) return res.status(400).json({message:'QR booking không hợp lệ'});
    res.json({valid:true,booking:b});
  }catch(e){next(e)}
});

router.post('/reception/check-in',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {bookingCode}=req.body;
    const scheduled=(await pool.query(`SELECT * FROM bookings WHERE booking_code=$1 AND status='CONFIRMED'`,[bookingCode])).rows[0];
    if(!scheduled)return res.status(400).json({message:'Booking chưa ở trạng thái có thể check-in'});
    const hotelSettings=(await pool.query(`SELECT time_rules_enabled FROM hotel_settings WHERE id=true`)).rows[0]||{time_rules_enabled:true};
    if(hotelSettings.time_rules_enabled && new Date()<new Date(scheduled.check_in)) return res.status(400).json({message:'Chưa đến giờ nhận phòng. Giờ nhận phòng là 14:00.'});
    const b=(await pool.query(`UPDATE bookings SET status='CHECKED_IN',actual_check_in=NOW() WHERE id=$1 AND status='CONFIRMED' RETURNING *`,[scheduled.id])).rows[0];
    const activatedServices=await pool.query(`UPDATE booking_services SET status='PENDING' WHERE booking_id=$1 AND status='RESERVED' RETURNING id,service_id,quantity,unit_price`,[b.id]);
    await pool.query(`UPDATE rooms SET status='OCCUPIED' WHERE id=$1`,[b.room_id]);
    await log(req.user.sub,'CHECK_IN','BOOKING',b.id,{activatedServices:activatedServices.rowCount});
    res.json({...b,activatedServices:activatedServices.rows});
  }catch(e){next(e)}
});

router.post('/reception/check-out',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {bookingCode,surcharge=0,collectPayment=true}=req.body;
    const b=(await pool.query(`SELECT * FROM bookings WHERE booking_code=$1 AND status='CHECKED_IN'`,[bookingCode])).rows[0];
    if(!b)return res.status(400).json({message:'Booking chưa check-in'});
    const hotelSettings=(await pool.query(`SELECT time_rules_enabled FROM hotel_settings WHERE id=true`)).rows[0]||{time_rules_enabled:true};
    const checkoutDeadline=new Date(b.check_out);
    const now=new Date();
    if(hotelSettings.time_rules_enabled && now>checkoutDeadline) return res.status(400).json({message:'Đã quá giờ trả phòng tối đa 12:00. Vui lòng xử lý trả phòng muộn theo quy định của khách sạn.'});
    const s=(await pool.query(`SELECT COALESCE(SUM(quantity*unit_price) FILTER (WHERE status NOT IN ('CANCELLED','RESERVED')),0) total FROM booking_services WHERE booking_id=$1`,[b.id])).rows[0].total;
    const totals=invoiceTotals({room:b.room_price,services:s,surcharge,deposit:b.deposit_amount});
    await pool.query(`INSERT INTO invoices(booking_id,room_total,service_total,surcharge,deposit_total,grand_total,remaining_total)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(booking_id) DO UPDATE SET room_total=EXCLUDED.room_total,service_total=EXCLUDED.service_total,surcharge=EXCLUDED.surcharge,deposit_total=EXCLUDED.deposit_total,grand_total=EXCLUDED.grand_total,remaining_total=EXCLUDED.remaining_total`,
      [b.id,b.room_price,s,surcharge,b.deposit_amount,totals.grandTotal,totals.remainingTotal]);
    if(Number(totals.remainingTotal)>0){
      // Không tự động ghi nhận thanh toán khi lễ tân bấm Trả phòng.
      // Khoản còn lại phải được khách gửi yêu cầu và lễ tân xác nhận SUCCESS trước khi checkout.
      const balance=await pool.query(`SELECT id,status,amount,provider FROM payments WHERE booking_id=$1 AND type='BALANCE' ORDER BY created_at DESC`,[b.id]);
      const successBalance=balance.rows.find(x=>x.status==='SUCCESS');
      if(Number(successBalance?.amount||0) < Number(totals.remainingTotal)){
        const pendingBalance=balance.rows.find(x=>x.status==='PENDING');
        return res.status(409).json({message:pendingBalance
          ? 'Khoản thanh toán còn lại đang chờ lễ tân xác nhận. Vui lòng chờ duyệt thanh toán trước khi trả phòng.'
          : 'Chưa có khoản thanh toán còn lại được xác nhận. Khách cần chọn tiền mặt hoặc chuyển khoản và lễ tân phải duyệt trước khi trả phòng.'});
      }
    }
    const updated=(await pool.query(`UPDATE bookings SET status='COMPLETED',actual_check_out=NOW() WHERE id=$1 RETURNING *`,[b.id])).rows[0];
    await pool.query(`UPDATE rooms SET status='CLEANING',cleaning_started_at=NOW(),cleaning_completed_at=NULL WHERE id=$1`,[b.room_id]);
    await log(req.user.sub,'CHECK_OUT','BOOKING',b.id,totals);
    res.json({booking:updated,invoice:totals});
    if(b.customer_id) await notify(b.customer_id,'Hóa đơn đã sẵn sàng',
      `Booking ${bookingCode} đã trả phòng. Tổng hóa đơn: ${vnd(totals.grandTotal)}. Xem chi tiết trong mục Hóa đơn.`,'/account');
  }catch(e){next(e)}
});

// Housekeeping: sau checkout phòng vào trạng thái đang dọn. Chỉ nhân viên mới được xác nhận dọn xong.
router.get('/reception/housekeeping',auth,roles('ADMIN','MANAGER','RECEPTIONIST','STAFF'),async(req,res,next)=>{
  try{
    const settings=(await pool.query(`SELECT cleaning_rules_enabled FROM hotel_settings WHERE id=true`)).rows[0]||{cleaning_rules_enabled:true};
    const cleaningRulesEnabled=settings.cleaning_rules_enabled!==false;
    const r=await pool.query(`SELECT r.*,rt.name room_type_name,rt.description FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id WHERE r.status='CLEANING' ORDER BY r.cleaning_started_at NULLS LAST,r.room_number`);
    const now=Date.now();
    res.json(r.rows.map(x=>({...x,cleaning_rules_enabled:cleaningRulesEnabled,cleaning_minutes:x.cleaning_started_at?Math.max(0,Math.floor((now-new Date(x.cleaning_started_at).getTime())/60000)):0,cleaning_overdue:cleaningRulesEnabled&&x.cleaning_started_at?now>new Date(new Date(x.cleaning_started_at).setHours(14,0,0,0)):false})));
  }catch(e){next(e)}
});
router.patch('/reception/rooms/:id/cleaning-complete',auth,roles('ADMIN','MANAGER','RECEPTIONIST','STAFF'),async(req,res,next)=>{
  try{
    const settings=(await pool.query(`SELECT cleaning_rules_enabled FROM hotel_settings WHERE id=true`)).rows[0]||{cleaning_rules_enabled:true};
    const cleaningRulesEnabled=settings.cleaning_rules_enabled!==false;
    if(cleaningRulesEnabled){
      const hourVN=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hour12:false}).format(new Date()));
      if(hourVN<12 || hourVN>=14) return res.status(400).json({message:'Chỉ được xác nhận dọn phòng trong khung 12:00–14:00. Quản lý/Admin có thể tắt giới hạn này trong Cấu hình vận hành để kiểm thử.'});
    }
    const r=await pool.query(`UPDATE rooms SET status='AVAILABLE',cleaning_completed_at=NOW() WHERE id=$1 AND status='CLEANING' RETURNING *`,[req.params.id]);
    if(!r.rowCount)return res.status(409).json({message:'Phòng không ở trạng thái đang dọn'});
    await log(req.user.sub,'ROOM_CLEANING_COMPLETED','ROOM',req.params.id,{cleaningRulesEnabled});
    res.json({...r.rows[0],cleaning_rules_enabled:cleaningRulesEnabled});
  }catch(e){next(e)}
});

// Bảo trì do Quản lý/Admin chủ động bật/tắt. Phòng bảo trì vẫn hiển thị cho khách nhưng không thể đặt.
router.get('/admin/maintenance',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{const r=await pool.query(`SELECT r.*,rt.name room_type_name,rt.description FROM rooms r JOIN room_types rt ON rt.id=r.room_type_id ORDER BY r.room_number`);res.json(r.rows)}catch(e){next(e)}
});
router.patch('/admin/maintenance/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {maintenance,note='',expectedEnd}=req.body;
    if(maintenance){
      const activeBooking=(await pool.query(`SELECT booking_code,check_in,check_out,status FROM bookings WHERE room_id=$1 AND status NOT IN ('CANCELLED','COMPLETED') AND check_out>NOW() LIMIT 1`,[req.params.id])).rows[0];
      if(activeBooking) return res.status(409).json({message:`Phòng đang có booking ${activeBooking.booking_code} chưa kết thúc, không thể đưa vào bảo trì.`});
      const r=await pool.query(`UPDATE rooms SET status='MAINTENANCE',maintenance_note=$1,maintenance_started_at=NOW(),maintenance_expected_end=$2 WHERE id=$3 RETURNING *`,[note?.trim()||null,expectedEnd||null,req.params.id]);
      if(!r.rowCount)return res.status(404).json({message:'Không tìm thấy phòng'}); await log(req.user.sub,'ROOM_MAINTENANCE_STARTED','ROOM',req.params.id,{note,expectedEnd}); return res.json(r.rows[0]);
    }
    const r=await pool.query(`UPDATE rooms SET status='AVAILABLE',maintenance_note=NULL,maintenance_started_at=NULL,maintenance_expected_end=NULL WHERE id=$1 AND status='MAINTENANCE' RETURNING *`,[req.params.id]);
    if(!r.rowCount)return res.status(409).json({message:'Phòng không ở trạng thái bảo trì'}); await log(req.user.sub,'ROOM_MAINTENANCE_COMPLETED','ROOM',req.params.id); res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.post('/reception/services',auth,roles('ADMIN','MANAGER','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {bookingId,serviceId,quantity=1}=req.body;
    const qty=Number(quantity);
    if(!bookingId||!serviceId||!Number.isInteger(qty)||qty<1||qty>50) return res.status(400).json({message:'Booking, dịch vụ hoặc số lượng không hợp lệ'});
    const s=(await pool.query(`SELECT * FROM services WHERE id=$1 AND is_active=true`,[serviceId])).rows[0];
    if(!s)return res.status(404).json({message:'Dịch vụ không tồn tại'});
    const r=await pool.query(`INSERT INTO booking_services(booking_id,service_id,quantity,unit_price,status) VALUES($1,$2,$3,$4,'PENDING') RETURNING *`,
      [bookingId,serviceId,qty,s.price]);
    await log(req.user.sub,'SERVICE_ADDED','BOOKING',bookingId,{serviceId,quantity});
    res.status(201).json(r.rows[0]);
  }catch(e){next(e)}
});

router.post('/payments/webhook',async(req,res,next)=>{
  try{
    // Điểm tích hợp nhà cung cấp thanh toán thật. Production phải verify chữ ký.
    const {bookingCode,transactionCode,amount,status,provider='BANK'}=req.body;
    if(process.env.PAYMENT_WEBHOOK_SECRET && req.headers['x-webhook-secret']!==process.env.PAYMENT_WEBHOOK_SECRET)
      return res.status(401).json({message:'Webhook signature invalid'});
    if(status!=='SUCCESS')return res.status(400).json({message:'Payment chưa thành công'});
    if(!bookingCode||!transactionCode) return res.status(400).json({message:'Thiếu mã booking hoặc mã giao dịch'});
    const webhookAmount=Number(amount);
    if(!Number.isFinite(webhookAmount)||webhookAmount<=0) return res.status(400).json({message:'Số tiền giao dịch không hợp lệ'});
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const b=(await c.query(`SELECT * FROM bookings WHERE booking_code=$1 FOR UPDATE`,[bookingCode])).rows[0];
      if(!b)throw Object.assign(new Error('Booking not found'),{status:404});
      const duplicate=await c.query(`SELECT id FROM payments WHERE transaction_code=$1`,[transactionCode]);
      if(duplicate.rowCount){await c.query('COMMIT');return res.json({ok:true,duplicate:true})}
      if(b.status!=='PENDING_PAYMENT') {
        await c.query('ROLLBACK');
        return res.status(409).json({message:'Booking không còn ở trạng thái chờ thanh toán cọc'});
      }
      const expiresAt=b.payment_expires_at || new Date(new Date(b.created_at).getTime()+15*60*1000);
      if(new Date(expiresAt)<=new Date()) {
        await c.query(`UPDATE payments SET status='EXPIRED' WHERE booking_id=$1 AND type='DEPOSIT' AND status='PENDING'`,[b.id]);
        await c.query(`UPDATE bookings SET status='CANCELLED',cancellation_reason='Hết thời hạn thanh toán cọc 15 phút' WHERE id=$1 AND status='PENDING_PAYMENT'`,[b.id]);
        await c.query('COMMIT');
        return res.status(410).json({message:'Thời hạn thanh toán cọc 15 phút đã hết. Booking đã được hủy, vui lòng đặt lại phòng.'});
      }
      const expectedDeposit=Number(b.deposit_amount||0);
      if(Math.round(webhookAmount)!==Math.round(expectedDeposit)) {
        await c.query('ROLLBACK');
        return res.status(409).json({message:`Số tiền giao dịch không khớp tiền cọc của booking (${expectedDeposit.toLocaleString('vi-VN')}đ).`});
      }
      await c.query(`INSERT INTO payments(booking_id,transaction_code,amount,type,status,provider,raw_payload,paid_at)
        VALUES($1,$2,$3,'DEPOSIT','SUCCESS',$4,$5,NOW())`,
        [b.id,transactionCode,webhookAmount,provider,JSON.stringify(req.body)]);
      await c.query(`UPDATE bookings SET status='CONFIRMED' WHERE id=$1 AND status='PENDING_PAYMENT'`,[b.id]);
      await c.query('COMMIT');
      res.json({ok:true});
      try{
        if(b.customer_id) await sendDepositConfirmationEmail(b.id);
      }catch(mailErr){ console.error('[MAIL] Không gửi được email xác nhận (webhook) cho booking',b.booking_code,'-',mailErr.message); }
    }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
  }catch(e){next(e)}
});

router.get('/admin/dashboard',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const [b,p,r,c,bs]=await Promise.all([
      pool.query(`SELECT COUNT(*)::int total FROM bookings`),
      pool.query(`SELECT COALESCE(SUM(amount),0) total FROM payments WHERE status='SUCCESS' AND type IN ('DEPOSIT','BALANCE')`),
      pool.query(`SELECT status,COUNT(*)::int count FROM rooms GROUP BY status ORDER BY status`),
      pool.query(`SELECT COUNT(*)::int total FROM users WHERE role='CUSTOMER'`),
      pool.query(`SELECT status,COUNT(*)::int count FROM bookings GROUP BY status ORDER BY status`)
    ]);
    res.json({bookings:b.rows[0].total,revenue:p.rows[0].total,rooms:r.rows,customers:c.rows[0].total,bookingStatuses:bs.rows});
  }catch(e){next(e)}
});

router.get('/admin/users',auth,roles('ADMIN'),async(req,res,next)=>{
  try{res.json((await pool.query(`SELECT id,full_name,email,phone,role,is_active,created_at FROM users ORDER BY created_at DESC`)).rows)}
  catch(e){next(e)}
});

// Admin tạo tài khoản mới — CHỈ tạo được tài khoản quyền ADMIN ở đây. Lễ tân/Quản lý
// KHÔNG tạo trực tiếp: người đó tự đăng ký một tài khoản khách hàng bình thường ở trang
// đăng ký, sau đó Admin vào tab "Người dùng" đổi role cho đúng tài khoản đó. Cách này giúp
// Admin không phải cấp phát/quản lý thêm mật khẩu tạm cho nhân viên, và khi thay đổi nhân
// sự (nghỉ việc, đổi vị trí) chỉ cần đổi lại role chứ không cần tạo/xóa tài khoản.
router.post('/admin/users',auth,roles('ADMIN'),async(req,res,next)=>{
  try{
    const {fullName,email,phone,password}=req.body;
    const emailOk=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'');
    if(!fullName||!emailOk||!password||password.length<8) return res.status(400).json({message:'Thông tin tài khoản chưa hợp lệ (kiểm tra lại email và mật khẩu tối thiểu 8 ký tự)'});
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query(`INSERT INTO users(full_name,email,phone,password_hash,role) VALUES($1,$2,$3,$4,'ADMIN')
      RETURNING id,full_name,email,phone,role,is_active,created_at`,[fullName,email.toLowerCase(),phone||null,hash]);
    await log(req.user.sub,'USER_CREATED','USER',r.rows[0].id,{role:'ADMIN'});
    res.status(201).json(r.rows[0]);
  }catch(e){
    if(e.code==='23505') return res.status(409).json({message:'Email này đã được sử dụng'});
    next(e)
  }
});

router.patch('/admin/users/:id/status',auth,roles('ADMIN'),async(req,res,next)=>{
  try{
    const {isActive}=req.body;
    const r=await pool.query(`UPDATE users SET is_active=$1 WHERE id=$2 RETURNING id,full_name,email,role,is_active`,[!!isActive,req.params.id]);
    await log(req.user.sub,'USER_STATUS_CHANGED','USER',req.params.id,{isActive});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.patch('/admin/users/:id/role',auth,roles('ADMIN'),async(req,res,next)=>{
  try{
    const {role}=req.body;
    if(!['ADMIN','MANAGER','RECEPTIONIST','STAFF','CUSTOMER'].includes(role))return res.status(400).json({message:'Role không hợp lệ'});
    const r=await pool.query(`UPDATE users SET role=$1 WHERE id=$2 RETURNING id,full_name,email,role,is_active`,[role,req.params.id]);
    await log(req.user.sub,'USER_ROLE_CHANGED','USER',req.params.id,{role});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

// Xóa tài khoản: chỉ xóa được nếu tài khoản đó CHƯA có booking/hoạt động nào trong hệ thống
// (để không phá vỡ dữ liệu báo cáo/audit log) — nếu đã có, đề nghị khóa thay vì xóa.
router.delete('/admin/users/:id',auth,roles('ADMIN'),async(req,res,next)=>{
  try{
    if(req.params.id===req.user.sub) return res.status(400).json({message:'Không thể tự xóa chính tài khoản đang đăng nhập'});
    const target=(await pool.query(`SELECT role FROM users WHERE id=$1`,[req.params.id])).rows[0];
    if(!target) return res.status(404).json({message:'Không tìm thấy tài khoản'});
    if(target.role==='ADMIN'){
      const c=await pool.query(`SELECT COUNT(*)::int c FROM users WHERE role='ADMIN' AND is_active=true`);
      if(c.rows[0].c<=1) return res.status(400).json({message:'Đây là Admin duy nhất còn hoạt động, không thể xóa'});
    }
    await pool.query(`DELETE FROM users WHERE id=$1`,[req.params.id]);
    await log(req.user.sub,'USER_DELETED','USER',req.params.id);
    res.json({ok:true});
  }catch(e){
    if(e.code==='23503') return res.status(409).json({message:'Tài khoản này đã có booking hoặc hoạt động trong hệ thống, không thể xóa — hãy dùng chức năng Khóa thay vì Xóa'});
    next(e)
  }
});

router.get('/admin/audit-logs',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT a.*,u.full_name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 300`);
    res.json(r.rows)
  }catch(e){next(e)}
});

router.get('/admin/export/bookings.csv',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT b.booking_code,u.full_name customer,r.room_number,b.check_in,b.actual_check_in,b.check_out,b.actual_check_out,b.room_price,b.deposit_amount,b.status,
      COALESCE(i.service_total,0) service_total,COALESCE(i.surcharge,0) surcharge,COALESCE(i.grand_total,0) invoice_total,COALESCE(i.remaining_total,0) remaining
      FROM bookings b LEFT JOIN users u ON u.id=b.customer_id JOIN rooms r ON r.id=b.room_id LEFT JOIN invoices i ON i.booking_id=b.id ORDER BY b.created_at DESC`);
    const headers=['booking_code','customer','room_number','check_in','actual_check_in','check_out','actual_check_out','room_price','deposit_amount','status','service_total','surcharge','invoice_total','remaining'];
    const csv=[headers.join(','),...r.rows.map(x=>headers.map(h=>`"${String(x[h]??'').replaceAll('"','""')}"`).join(','))].join('\\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="bookings.csv"');
    res.send('\\ufeff'+csv);
  }catch(e){next(e)}
});

// ---------- Giá ngày lễ / ngày đặc biệt (Admin/Manager) ----------
router.get('/admin/special-room-prices',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT sp.*,rt.name room_type_name
      FROM special_room_prices sp JOIN room_types rt ON rt.id=sp.room_type_id
      ORDER BY sp.date_from DESC,rt.name`);
    res.json(r.rows);
  }catch(e){next(e)}
});
router.post('/admin/special-room-prices',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {roomTypeId,name,dateFrom,dateTo,price}=req.body;
    const amount=Number(price);
    if(!roomTypeId||!name?.trim()||!dateFrom||!dateTo||!Number.isFinite(amount)||amount<0) return res.status(400).json({message:'Vui lòng nhập đầy đủ thông tin giá ngày đặc biệt'});
    if(String(dateFrom)>String(dateTo)) return res.status(400).json({message:'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu'});
    const rt=(await pool.query(`SELECT id FROM room_types WHERE id=$1`,[roomTypeId])).rows[0];
    if(!rt) return res.status(404).json({message:'Loại phòng không tồn tại'});
    const overlap=await pool.query(`SELECT 1 FROM special_room_prices WHERE room_type_id=$1 AND is_active=true AND date_from <= $3::date AND date_to >= $2::date LIMIT 1`,[roomTypeId,dateFrom,dateTo]);
    if(overlap.rowCount) return res.status(409).json({message:'Khoảng ngày này đã có giá đặc biệt cho loại phòng đã chọn'});
    const r=await pool.query(`INSERT INTO special_room_prices(room_type_id,name,date_from,date_to,price,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[roomTypeId,name.trim(),dateFrom,dateTo,amount,req.user.sub]);
    const row=(await pool.query(`SELECT sp.*,rt.name room_type_name FROM special_room_prices sp JOIN room_types rt ON rt.id=sp.room_type_id WHERE sp.id=$1`,[r.rows[0].id])).rows[0];
    await log(req.user.sub,'SPECIAL_PRICE_CREATED','SPECIAL_ROOM_PRICE',row.id,{name:row.name,dateFrom,dateTo,price:amount,roomTypeId});
    res.status(201).json(row);
  }catch(e){next(e)}
});
router.patch('/admin/special-room-prices/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const current=(await pool.query(`SELECT * FROM special_room_prices WHERE id=$1`,[req.params.id])).rows[0];
    if(!current) return res.status(404).json({message:'Không tìm thấy giá ngày đặc biệt'});
    const roomTypeId=req.body.roomTypeId??current.room_type_id, name=req.body.name??current.name;
    const dateFrom=req.body.dateFrom??String(current.date_from).slice(0,10), dateTo=req.body.dateTo??String(current.date_to).slice(0,10);
    const amount=req.body.price==null?Number(current.price):Number(req.body.price);
    if(!roomTypeId||!name?.trim()||String(dateFrom)>String(dateTo)||!Number.isFinite(amount)||amount<0) return res.status(400).json({message:'Thông tin giá ngày đặc biệt không hợp lệ'});
    const overlap=await pool.query(`SELECT 1 FROM special_room_prices WHERE id<>$1 AND room_type_id=$2 AND is_active=true AND date_from <= $4::date AND date_to >= $3::date LIMIT 1`,[req.params.id,roomTypeId,dateFrom,dateTo]);
    if(overlap.rowCount) return res.status(409).json({message:'Khoảng ngày mới bị trùng với giá đặc biệt khác'});
    const r=await pool.query(`UPDATE special_room_prices SET room_type_id=$1,name=$2,date_from=$3,date_to=$4,price=$5,is_active=COALESCE($6,is_active) WHERE id=$7 RETURNING *`,[roomTypeId,name.trim(),dateFrom,dateTo,amount,req.body.isActive==null?null:Boolean(req.body.isActive),req.params.id]);
    const row=(await pool.query(`SELECT sp.*,rt.name room_type_name FROM special_room_prices sp JOIN room_types rt ON rt.id=sp.room_type_id WHERE sp.id=$1`,[req.params.id])).rows[0];
    await log(req.user.sub,'SPECIAL_PRICE_UPDATED','SPECIAL_ROOM_PRICE',req.params.id,req.body); res.json(row);
  }catch(e){next(e)}
});
router.delete('/admin/special-room-prices/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`DELETE FROM special_room_prices WHERE id=$1 RETURNING id`,[req.params.id]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy giá ngày đặc biệt'});
    await log(req.user.sub,'SPECIAL_PRICE_DELETED','SPECIAL_ROOM_PRICE',req.params.id); res.json({ok:true});
  }catch(e){next(e)}
});

// ---------- Quản lý loại phòng & phòng (Admin/Manager) ----------
router.get('/admin/room-types',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{res.json((await pool.query(`SELECT * FROM room_types ORDER BY name`)).rows)}catch(e){next(e)}
});

// ---------- Mã giảm giá (Admin/Manager) ----------
router.get('/admin/discount-codes',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{res.json((await pool.query(`SELECT * FROM discount_codes ORDER BY created_at DESC`)).rows)}catch(e){next(e)}
});

router.post('/admin/discount-codes',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {code,percentOff,amountOff,maxUses,validFrom,validTo}=req.body;
    if(!code||!code.trim()) return res.status(400).json({message:'Vui lòng nhập mã giảm giá'});
    if(!percentOff&&!amountOff) return res.status(400).json({message:'Cần nhập % giảm hoặc số tiền giảm'});
    const r=await pool.query(`INSERT INTO discount_codes(code,percent_off,amount_off,max_uses,valid_from,valid_to)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code.trim().toUpperCase(),percentOff||null,amountOff||null,maxUses||null,validFrom||null,validTo||null]);
    await log(req.user.sub,'DISCOUNT_CREATED','DISCOUNT_CODE',r.rows[0].id);
    res.status(201).json(r.rows[0]);
  }catch(e){
    if(e.code==='23505') return res.status(409).json({message:'Mã giảm giá này đã tồn tại'});
    next(e)
  }
});

router.patch('/admin/discount-codes/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {isActive}=req.body;
    const r=await pool.query(`UPDATE discount_codes SET is_active=$1 WHERE id=$2 RETURNING *`,[isActive,req.params.id]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy mã giảm giá'});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.delete('/admin/discount-codes/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{ await pool.query(`DELETE FROM discount_codes WHERE id=$1`,[req.params.id]); res.json({ok:true}); }catch(e){next(e)}
});

// Khách kiểm tra mã trước khi đặt phòng (không bắt buộc đăng nhập vai trò cụ thể, chỉ cần đăng nhập).
router.get('/discount-codes/:code/check',auth,async(req,res,next)=>{
  try{
    const d=(await pool.query(`SELECT * FROM discount_codes WHERE code=$1`,[req.params.code.toUpperCase()])).rows[0];
    if(!d||!d.is_active) return res.status(404).json({message:'Mã giảm giá không tồn tại hoặc đã ngừng áp dụng'});
    if(d.valid_from&&new Date(d.valid_from)>new Date()) return res.status(400).json({message:'Mã giảm giá chưa đến thời gian áp dụng'});
    if(d.valid_to&&new Date(d.valid_to)<new Date()) return res.status(400).json({message:'Mã giảm giá đã hết hạn'});
    if(d.max_uses&&d.used_count>=d.max_uses) return res.status(400).json({message:'Mã giảm giá đã hết lượt sử dụng'});
    res.json(d);
  }catch(e){next(e)}
});

// ---------- Thông báo trong ứng dụng ----------
router.get('/notifications',auth,async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT * FROM notifications WHERE user_id=$1 ${req.query.unread==='1'?'AND is_read=false':''} ORDER BY created_at DESC LIMIT 50`,[req.user.sub]);
    res.json(r.rows);
  }catch(e){next(e)}
});
router.post('/notifications/:id/read',auth,async(req,res,next)=>{
  try{ await pool.query(`UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2`,[req.params.id,req.user.sub]); res.json({ok:true}); }catch(e){next(e)}
});
router.post('/notifications/read-all',auth,async(req,res,next)=>{
  try{ await pool.query(`UPDATE notifications SET is_read=true WHERE user_id=$1 AND is_read=false`,[req.user.sub]); res.json({ok:true}); }catch(e){next(e)}
});

router.post('/admin/room-types',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {name,description,capacity,basePrice,amenities=[]}=req.body;
    if(!name||!basePrice) return res.status(400).json({message:'Thiếu tên hoặc giá phòng'});
    const r=await pool.query(`INSERT INTO room_types(name,description,capacity,base_price,amenities) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [name,description||null,capacity||2,basePrice,JSON.stringify(amenities)]);
    await log(req.user.sub,'ROOM_TYPE_CREATED','ROOM_TYPE',r.rows[0].id);
    res.status(201).json(r.rows[0]);
  }catch(e){next(e)}
});

router.patch('/admin/room-types/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {name,description,capacity,basePrice,amenities}=req.body;
    const parsedBasePrice=basePrice==null?null:Number(basePrice);
    if(parsedBasePrice!==null && (!Number.isFinite(parsedBasePrice)||parsedBasePrice<0)) return res.status(400).json({message:'Giá phòng phải là số lớn hơn hoặc bằng 0'});
    const r=await pool.query(`UPDATE room_types SET name=COALESCE($1,name),description=COALESCE($2,description),
      capacity=COALESCE($3,capacity),base_price=COALESCE($4,base_price),amenities=COALESCE($5,amenities) WHERE id=$6 RETURNING *`,
      [name,description,capacity,parsedBasePrice,amenities?JSON.stringify(amenities):null,req.params.id]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy loại phòng'});
    await log(req.user.sub,'ROOM_TYPE_UPDATED','ROOM_TYPE',req.params.id,req.body);
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.delete('/admin/room-types/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    await pool.query(`DELETE FROM room_types WHERE id=$1`,[req.params.id]);
    await log(req.user.sub,'ROOM_TYPE_DELETED','ROOM_TYPE',req.params.id);
    res.json({ok:true});
  }catch(e){
    if(e.code==='23503') return res.status(409).json({message:'Vẫn còn phòng thuộc loại này, không thể xóa'});
    next(e)
  }
});

router.post('/admin/rooms',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {roomNumber,roomTypeId}=req.body;
    if(!roomNumber||!roomTypeId) return res.status(400).json({message:'Thiếu số phòng hoặc loại phòng'});
    const r=await pool.query(`INSERT INTO rooms(room_number,room_type_id) VALUES($1,$2) RETURNING *`,[roomNumber,roomTypeId]);
    await log(req.user.sub,'ROOM_CREATED','ROOM',r.rows[0].id);
    res.status(201).json(r.rows[0]);
  }catch(e){next(e)}
});

router.patch('/admin/rooms/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {roomNumber,roomTypeId,status}=req.body;
    if(status&&!['AVAILABLE','BOOKED','OCCUPIED','CLEANING','MAINTENANCE'].includes(status))
      return res.status(400).json({message:'Trạng thái phòng không hợp lệ'});
    const r=await pool.query(`UPDATE rooms SET room_number=COALESCE($1,room_number),room_type_id=COALESCE($2,room_type_id),
      status=COALESCE($3,status) WHERE id=$4 RETURNING *`,[roomNumber,roomTypeId,status,req.params.id]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy phòng'});
    await log(req.user.sub,'ROOM_UPDATED','ROOM',req.params.id,req.body);
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.delete('/admin/rooms/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    await pool.query(`DELETE FROM rooms WHERE id=$1`,[req.params.id]);
    await log(req.user.sub,'ROOM_DELETED','ROOM',req.params.id);
    res.json({ok:true});
  }catch(e){
    if(e.code==='23503') return res.status(409).json({message:'Phòng đã có booking, không thể xóa'});
    next(e)
  }
});

// ---------- Duyệt thanh toán chuyển khoản (Lễ tân/Quản lý/Admin) ----------
// Khách không thể tự xác nhận "đã chuyển khoản" — chỉ nhân viên xem biên lai rồi xác nhận mới đổi trạng thái.
router.get('/admin/payments/pending',auth,roles('ADMIN','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT p.*,b.booking_code,b.status booking_status,u.full_name customer,u.email
      FROM payments p JOIN bookings b ON b.id=p.booking_id LEFT JOIN users u ON u.id=b.customer_id
      WHERE p.status='PENDING' AND (p.proof_url IS NOT NULL OR p.provider IN ('CASH','BANK_TRANSFER')) ORDER BY p.created_at ASC`);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.post('/admin/payments/:id/confirm',auth,roles('ADMIN','RECEPTIONIST'),async(req,res,next)=>{
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const p=(await c.query(`SELECT * FROM payments WHERE id=$1 AND status='PENDING' FOR UPDATE`,[req.params.id])).rows[0];
    if(!p){await c.query('ROLLBACK');return res.status(404).json({message:'Không tìm thấy khoản thanh toán đang chờ'})}
    let b=(await c.query(`SELECT * FROM bookings WHERE id=$1 FOR UPDATE`,[p.booking_id])).rows[0];
    if(!b){await c.query('ROLLBACK');return res.status(404).json({message:'Booking của khoản thanh toán không tồn tại'})}
    if(p.type==='DEPOSIT'){
      const expiresAt=p.expires_at||b.payment_expires_at;
      if(b.status!=='PENDING_PAYMENT'){await c.query('ROLLBACK');return res.status(409).json({message:'Booking không còn ở trạng thái chờ xác nhận tiền cọc'})}
      if(expiresAt && new Date(expiresAt)<=new Date()){
        await c.query(`UPDATE payments SET status='EXPIRED' WHERE id=$1 AND status='PENDING'`,[p.id]);
        await c.query(`UPDATE bookings SET status='CANCELLED',cancellation_reason='Hết thời hạn thanh toán cọc 15 phút' WHERE id=$1 AND status='PENDING_PAYMENT'`,[b.id]);
        await c.query('COMMIT');
        return res.status(410).json({message:'Thời hạn thanh toán cọc 15 phút đã hết. Booking đã được hủy, vui lòng đặt lại phòng.'});
      }
      if(Math.round(Number(p.amount))!==Math.round(Number(b.deposit_amount||0))){await c.query('ROLLBACK');return res.status(409).json({message:'Số tiền thanh toán cọc không khớp booking'})}
    }
    if(p.type==='BALANCE' && !['CONFIRMED','CHECKED_IN','COMPLETED'].includes(b.status)){await c.query('ROLLBACK');return res.status(409).json({message:'Booking không còn ở trạng thái có thể xác nhận thanh toán phần còn lại'})}
    const updated=(await c.query(`UPDATE payments SET status='SUCCESS',paid_at=NOW() WHERE id=$1 AND status='PENDING' RETURNING *`,[p.id])).rows[0];
    if(p.type==='DEPOSIT'){
      b=(await c.query(`UPDATE bookings SET status='CONFIRMED' WHERE id=$1 AND status='PENDING_PAYMENT' RETURNING *`,[p.booking_id])).rows[0]||b;
    }
    await log(req.user.sub,'PAYMENT_CONFIRMED','PAYMENT',p.id,{bookingCode:b.booking_code,type:p.type,amount:p.amount});
    await c.query('COMMIT');
    res.json({payment:updated,booking:b});
    // QUAN TRỌNG: transaction đã COMMIT và đã trả response cho client ở trên rồi.
    // Việc gửi email/thông báo chỉ là bước "cộng thêm" — nếu SMTP lỗi (sai mật khẩu app,
    // Gmail chặn, mất mạng...) mà không tự bắt lỗi ở đây, code cũ sẽ rơi xuống catch() bên
    // dưới, gọi next(e) sau khi đã res.json() rồi → Express cố gửi response lần 2 → lỗi
    // "Cannot set headers after they are sent" làm crash luồng xử lý. Vì vậy các bước sau
    // COMMIT phải tự try/catch, lỗi chỉ log ra console chứ không được next(e)/rollback nữa.
    try{
      if(p.type==='DEPOSIT'&&b.customer_id) {
        await sendDepositConfirmationEmail(b.id);
        await sendInvoiceEmail(b.id,{subjectPrefix:'Xác nhận thanh toán / hóa đơn tạm tính'});
      }
      if(p.type==='BALANCE'&&b.customer_id) await sendInvoiceEmail(b.id,{subjectPrefix:'Hóa đơn thanh toán'});
    }catch(mailErr){ console.error('[MAIL] Không gửi được email thanh toán cho booking',b.booking_code,'-',mailErr.message); }
    try{
      if(b.customer_id) await notify(b.customer_id,'Thanh toán đã được xác nhận',
        `Khoản ${p.type==='DEPOSIT'?'đặt cọc':'thanh toán'} cho booking ${b.booking_code} đã được xác nhận thành công.`,'/account');
    }catch(notifyErr){ console.error('[NOTIFY] Không tạo được thông báo cho booking',b.booking_code,'-',notifyErr.message); }
  }catch(e){await c.query('ROLLBACK');next(e)}finally{c.release()}
});

router.post('/admin/payments/:id/reject',auth,roles('ADMIN','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {reason}=req.body;
    const r=await pool.query(`UPDATE payments SET status='REJECTED',raw_payload=raw_payload||$1::jsonb WHERE id=$2 AND status='PENDING' RETURNING *`,
      [JSON.stringify({rejectReason:reason||'Không khớp giao dịch'}),req.params.id]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy khoản thanh toán đang chờ'});
    await log(req.user.sub,'PAYMENT_REJECTED','PAYMENT',req.params.id,{reason});
    const bk=(await pool.query(`SELECT customer_id,booking_code FROM bookings WHERE id=$1`,[r.rows[0].booking_id])).rows[0];
    if(bk?.customer_id) await notify(bk.customer_id,'Biên lai bị từ chối',
      `Biên lai chuyển khoản cho booking ${bk.booking_code} không được chấp nhận${reason?': '+reason:''}. Vui lòng kiểm tra và gửi lại.`,'/account');
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

// ---------- Hoàn tiền thủ công có kiểm soát ----------
// Chỉ ADMIN/MANAGER được duyệt và xác nhận hoàn tiền. Lễ tân không có quyền thao tác refund.
router.get('/admin/refunds',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT p.*,b.booking_code,r.room_number,u.full_name customer,u.email customer_email
      FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN rooms r ON r.id=b.room_id LEFT JOIN users u ON u.id=b.customer_id
      WHERE p.type='REFUND' ORDER BY p.created_at DESC`);
    const rows=await Promise.all(r.rows.map(async row=>{
      const refund=row.raw_payload||{};
      let qrUrl=null;
      if(row.status==='APPROVED' && refund.refundMethod==='BANK_TRANSFER' && refund.refundBankCode && refund.refundBankAccount){
        // Nội dung chuyển khoản hoàn tiền = số phòng, tự động lấy từ booking.
        const info=encodeURIComponent(`PHONG ${row.room_number}`);
        qrUrl=`https://img.vietqr.io/image/${refund.refundBankCode}-${refund.refundBankAccount}-compact2.png?amount=${Math.round(Number(row.amount))}&addInfo=${info}&accountName=${encodeURIComponent(refund.refundAccountName||'')}`;
      }
      return {...row, refund, refund_qr_url:qrUrl};
    }));
    res.json(rows);
  }catch(e){next(e)}
});

router.patch('/admin/refunds/:paymentId',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {status,reason=''}=req.body;
    if(!['APPROVED','SUCCESS','REJECTED'].includes(status)) return res.status(400).json({message:'Trạng thái hoàn tiền không hợp lệ'});
    const current=(await pool.query(`SELECT * FROM payments WHERE id=$1::uuid AND type='REFUND'`,[req.params.paymentId])).rows[0];
    if(!current) return res.status(404).json({message:'Không tìm thấy yêu cầu hoàn tiền'});
    const payload={...(current.raw_payload||{})};
    if(status==='APPROVED'){
      if(current.status!=='PENDING') return res.status(409).json({message:'Chỉ yêu cầu đang chờ mới được duyệt'});
      if(payload.refundMethod==='BANK_TRANSFER' && (!payload.refundBankCode||!payload.refundBankAccount||!payload.refundAccountName)) return res.status(400).json({message:'Khách chưa cung cấp đủ thông tin tài khoản nhận hoàn tiền'});
      payload.approvedBy=req.user.sub; payload.approvedAt=new Date().toISOString();
      if(reason) payload.refundReason=reason;
      const r=await pool.query(`UPDATE payments SET status='APPROVED',raw_payload=$1::jsonb WHERE id=$2::uuid AND status='PENDING' RETURNING *`,[JSON.stringify(payload),current.id]);
      if(!r.rowCount) return res.status(409).json({message:'Yêu cầu vừa được xử lý bởi người khác'});
      const bk=(await pool.query(`SELECT customer_id,booking_code,r.room_number FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE b.id=$1`,[current.booking_id])).rows[0];
      await log(req.user.sub,'REFUND_APPROVED','PAYMENT',current.id,{bookingCode:bk?.booking_code,amount:current.amount});
      if(bk?.customer_id) await notify(bk.customer_id,'Hoàn tiền đã được duyệt',`Yêu cầu hoàn ${vnd(current.amount)} cho booking ${bk.booking_code} đã được quản lý duyệt. Khách sạn đang thực hiện chuyển tiền.`,'/account');
      let refundQrUrl=null;
      if(payload.refundMethod==='BANK_TRANSFER' && payload.refundBankCode && payload.refundBankAccount && bk?.room_number){
        refundQrUrl=`https://img.vietqr.io/image/${payload.refundBankCode}-${payload.refundBankAccount}-compact2.png?amount=${Math.round(Number(current.amount))}&addInfo=${encodeURIComponent(`PHONG ${bk.room_number}`)}&accountName=${encodeURIComponent(payload.refundAccountName||'')}`;
      }
      return res.json({...r.rows[0],refund:r.rows[0].raw_payload||{},refund_qr_url:refundQrUrl,booking_code:bk?.booking_code||null,room_number:bk?.room_number||null});
    }
    if(status==='SUCCESS'){
      if(current.status!=='APPROVED') return res.status(409).json({message:'Khoản hoàn tiền phải được quản lý duyệt trước khi xác nhận đã chuyển'});
      if(payload.refundMethod==='BANK_TRANSFER' && (!payload.refundBankCode||!payload.refundBankAccount||!payload.refundAccountName)) return res.status(400).json({message:'Thiếu thông tin tài khoản nhận hoàn tiền'});
      // Nội dung chuyển khoản luôn là số phòng, không cho người dùng nhập thủ công.
      const bk=(await pool.query(`SELECT customer_id,booking_code,r.room_number FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE b.id=$1`,[current.booking_id])).rows[0];
      if(!bk?.room_number) return res.status(400).json({message:'Không xác định được số phòng của yêu cầu hoàn tiền'});
      payload.bankReference=`PHONG ${bk.room_number}`; payload.processedBy=req.user.sub; payload.processedAt=new Date().toISOString();
      const r=await pool.query(`UPDATE payments SET status='SUCCESS',paid_at=NOW(),raw_payload=$1::jsonb WHERE id=$2::uuid AND status='APPROVED' RETURNING *`,[JSON.stringify(payload),current.id]);
      if(!r.rowCount) return res.status(409).json({message:'Yêu cầu vừa được xử lý bởi người khác'});
      await log(req.user.sub,'REFUND_SUCCESS','PAYMENT',current.id,{bookingCode:bk.booking_code,amount:current.amount,bankReference:payload.bankReference});
      if(bk?.customer_id){
        try{ await notify(bk.customer_id,'Hoàn tiền đã được chuyển',`Khoản hoàn ${vnd(current.amount)} cho booking ${bk.booking_code} (phòng ${bk.room_number}) đã được quản lý xác nhận đã chuyển tiền. Nội dung chuyển khoản: ${payload.bankReference}.`,'/account'); }
        catch(notifyErr){ console.error('[NOTIFY] Không tạo được thông báo hoàn tiền',notifyErr.message); }
      }
      return res.json(r.rows[0]);
    }
    if(!['PENDING','APPROVED'].includes(current.status)) return res.status(409).json({message:'Yêu cầu hoàn tiền này đã được xử lý'});
    payload.refundReason=reason||'Quản lý từ chối yêu cầu hoàn tiền'; payload.processedBy=req.user.sub; payload.processedAt=new Date().toISOString();
    const r=await pool.query(`UPDATE payments SET status='REJECTED',raw_payload=$1::jsonb WHERE id=$2::uuid AND status IN ('PENDING','APPROVED') RETURNING *`,[JSON.stringify(payload),current.id]);
    if(!r.rowCount) return res.status(409).json({message:'Yêu cầu vừa được xử lý bởi người khác'});
    const bk=(await pool.query(`SELECT customer_id,booking_code,r.room_number FROM bookings b JOIN rooms r ON r.id=b.room_id WHERE b.id=$1`,[current.booking_id])).rows[0];
    await log(req.user.sub,'REFUND_REJECTED','PAYMENT',current.id,{bookingCode:bk?.booking_code,amount:current.amount,reason});
    if(bk?.customer_id) await notify(bk.customer_id,'Yêu cầu hoàn tiền bị từ chối',`Yêu cầu hoàn tiền cho booking ${bk.booking_code} bị từ chối: ${payload.refundReason}`,'/account');
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

// ---------- Xuất danh sách tài khoản (Admin) — không xuất mật khẩu/token/secret ----------
router.get('/admin/export/accounts.csv',auth,roles('ADMIN'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT id,full_name,email,phone,role,is_active,created_at FROM users ORDER BY created_at DESC`);
    const headers=['id','full_name','email','phone','role','is_active','created_at'];
    const csv=[headers.join(','),...r.rows.map(x=>headers.map(h=>`"${String(x[h]??'').replaceAll('"','""')}"`).join(','))].join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="accounts.csv"');
    res.send('\ufeff'+csv);
  }catch(e){next(e)}
});


// ---------- Cấu hình thanh toán / email / giờ vận hành ----------
router.get('/admin/operation-settings',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT time_rules_enabled,cleaning_rules_enabled,updated_at FROM hotel_settings WHERE id=true`);
    res.json(r.rows[0]||{time_rules_enabled:true,cleaning_rules_enabled:true});
  }catch(e){next(e)}
});
router.patch('/admin/operation-settings',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const hasTime=typeof req.body.timeRulesEnabled==='boolean';
    const hasCleaning=typeof req.body.cleaningRulesEnabled==='boolean';
    if(!hasTime && !hasCleaning) return res.status(400).json({message:'Cần chọn timeRulesEnabled hoặc cleaningRulesEnabled là true/false'});
    const current=(await pool.query(`SELECT time_rules_enabled,cleaning_rules_enabled FROM hotel_settings WHERE id=true`)).rows[0]||{time_rules_enabled:true,cleaning_rules_enabled:true};
    const timeRulesEnabled=hasTime?req.body.timeRulesEnabled:current.time_rules_enabled!==false;
    const cleaningRulesEnabled=hasCleaning?req.body.cleaningRulesEnabled:current.cleaning_rules_enabled!==false;
    const r=await pool.query(`INSERT INTO hotel_settings(id,time_rules_enabled,cleaning_rules_enabled,updated_at) VALUES(true,$1,$2,NOW())
      ON CONFLICT(id) DO UPDATE SET time_rules_enabled=EXCLUDED.time_rules_enabled,cleaning_rules_enabled=EXCLUDED.cleaning_rules_enabled,updated_at=NOW()
      RETURNING time_rules_enabled,cleaning_rules_enabled,updated_at`,[timeRulesEnabled,cleaningRulesEnabled]);
    if(hasTime) await log(req.user.sub,'OPERATION_TIME_RULES_UPDATED','HOTEL_SETTINGS',null,{timeRulesEnabled:r.rows[0].time_rules_enabled});
    if(hasCleaning) await log(req.user.sub,'OPERATION_CLEANING_RULES_UPDATED','HOTEL_SETTINGS',null,{cleaningRulesEnabled:r.rows[0].cleaning_rules_enabled});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

// ---------- Cấu hình thanh toán / email ----------
router.get('/admin/payment-settings',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT bank_code,bank_account,bank_account_name,hotel_email,updated_at FROM hotel_settings WHERE id=true`);
    res.json(r.rows[0]||{bank_code:'VCB',bank_account:'',bank_account_name:'LUXORA HOTEL',hotel_email:''});
  }catch(e){next(e)}
});
router.patch('/admin/payment-settings',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {bankCode,bankAccount,bankAccountName,hotelEmail}=req.body;
    if(!bankCode||!bankAccount||!bankAccountName) return res.status(400).json({message:'Vui lòng nhập ngân hàng, số tài khoản và tên tài khoản'});
    const emailOk=!hotelEmail||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hotelEmail);
    if(!emailOk) return res.status(400).json({message:'Email khách sạn không hợp lệ'});
    const r=await pool.query(`INSERT INTO hotel_settings(id,bank_code,bank_account,bank_account_name,hotel_email,updated_at) VALUES(true,$1,$2,$3,$4,NOW())
      ON CONFLICT(id) DO UPDATE SET bank_code=EXCLUDED.bank_code,bank_account=EXCLUDED.bank_account,bank_account_name=EXCLUDED.bank_account_name,hotel_email=EXCLUDED.hotel_email,updated_at=NOW()
      RETURNING bank_code,bank_account,bank_account_name,hotel_email,updated_at`,[bankCode.trim().toUpperCase(),bankAccount.trim(),bankAccountName.trim(),hotelEmail?.trim()||null]);
    await log(req.user.sub,'PAYMENT_SETTINGS_UPDATED','HOTEL_SETTINGS',null,{bankCode:r.rows[0].bank_code,bankAccount:r.rows[0].bank_account});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});
router.post('/admin/email-test',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {to}=req.body;
    if(!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({message:'Email nhận test không hợp lệ'});
    const {sendTestEmail}=await import('../utils/ThuDienTu.js');
    const result=await sendTestEmail(to);
    res.json({ok:true,demo:!!result?.demo,message:result?.demo?'SMTP chưa cấu hình: email chỉ được ghi log trên server.':'Đã gửi email test.'});
  }catch(e){next(e)}
});


// ---------- Chấm công + tiền lương ----------
const payrollRoles=['STAFF','RECEPTIONIST'];
const localDateVN=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const validMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m||''));

router.get('/attendance/me',auth,roles('STAFF','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const month=validMonth(req.query.month)?req.query.month:localDateVN().slice(0,7);
    const r=await pool.query(`SELECT id,work_date,clock_in,clock_out,device_key,note
      FROM attendance_records WHERE user_id=$1 AND work_date >= ($2||'-01')::date
      AND work_date < (($2||'-01')::date + INTERVAL '1 month') ORDER BY work_date DESC`,[req.user.sub,month]);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.get('/payroll/account',auth,roles('STAFF','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT bank_code,bank_account,account_name,updated_at FROM payroll_accounts WHERE user_id=$1`,[req.user.sub]);
    res.json(r.rows[0]||null);
  }catch(e){next(e)}
});
router.patch('/payroll/account',auth,roles('STAFF','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {bankCode,bankAccount,accountName}=req.body;
    if(!bankCode||!bankAccount||!accountName) return res.status(400).json({message:'Vui lòng nhập ngân hàng, số tài khoản và tên chủ tài khoản'});
    const r=await pool.query(`INSERT INTO payroll_accounts(user_id,bank_code,bank_account,account_name,updated_at)
      VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(user_id) DO UPDATE SET bank_code=EXCLUDED.bank_code,bank_account=EXCLUDED.bank_account,account_name=EXCLUDED.account_name,updated_at=NOW()
      RETURNING bank_code,bank_account,account_name,updated_at`,[req.user.sub,String(bankCode).trim().toUpperCase(),String(bankAccount).trim(),String(accountName).trim().toUpperCase()]);
    await log(req.user.sub,'PAYROLL_ACCOUNT_UPDATED','USER',req.user.sub,{bankCode:r.rows[0].bank_code});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.get('/attendance/qr',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const exp=Math.floor(Date.now()/1000)+600;
    const token=jwt.sign({purpose:'LUXORA_ATTENDANCE_QR',exp},process.env.JWT_SECRET);
    const requestedBase=String(req.query.baseUrl||'').trim();
    const base=/^https?:\/\//i.test(requestedBase)?requestedBase:(process.env.CLIENT_URL||'http://localhost:5173');
    const url=`${base.replace(/\/$/,'')}/account?attendanceToken=${encodeURIComponent(token)}`;
    const qr=await QRCode.toDataURL(url,{margin:6,width:640,errorCorrectionLevel:'L',color:{dark:'#111111',light:'#FFFFFF'}});
    res.json({qrDataUrl:qr,expiresAt:new Date(exp*1000).toISOString(),url});
  }catch(e){next(e)}
});

router.post('/attendance/toggle',auth,roles('STAFF','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const {token,deviceKey}=req.body;
    if(!token) return res.status(400).json({message:'Mã chấm công không hợp lệ'});
    let payload;
    try{ payload=jwt.verify(token,process.env.JWT_SECRET); }catch(_e){ return res.status(400).json({message:'Mã chấm công đã hết hạn, vui lòng quét mã mới'}); }
    if(payload.purpose!=='LUXORA_ATTENDANCE_QR') return res.status(400).json({message:'Mã chấm công không hợp lệ'});
    const workDate=localDateVN();
    const current=(await pool.query(`SELECT * FROM attendance_records WHERE user_id=$1 AND work_date=$2`,[req.user.sub,workDate])).rows[0];
    const safeDevice=String(deviceKey||'').slice(0,120)||null;
    if(!current){
      const r=await pool.query(`INSERT INTO attendance_records(user_id,work_date,clock_in,device_key) VALUES($1,$2,NOW(),$3) RETURNING *`,[req.user.sub,workDate,safeDevice]);
      await log(req.user.sub,'ATTENDANCE_CLOCK_IN','ATTENDANCE',r.rows[0].id,{workDate});
      return res.json({action:'CLOCK_IN',message:'Đã chấm công vào ca.',record:r.rows[0]});
    }
    if(current.clock_in && !current.clock_out){
      const r=await pool.query(`UPDATE attendance_records SET clock_out=NOW(),updated_at=NOW() WHERE id=$1 AND clock_out IS NULL RETURNING *`,[current.id]);
      if(!r.rowCount) return res.status(409).json({message:'Ca làm đã được cập nhật, vui lòng tải lại'});
      await log(req.user.sub,'ATTENDANCE_CLOCK_OUT','ATTENDANCE',current.id,{workDate});
      return res.json({action:'CLOCK_OUT',message:'Đã chấm công kết thúc ca.',record:r.rows[0]});
    }
    return res.status(409).json({message:'Bạn đã chấm công đủ vào và ra trong ngày hôm nay.'});
  }catch(e){next(e)}
});

router.get('/payroll/me',auth,roles('STAFF','RECEPTIONIST'),async(req,res,next)=>{
  try{
    const month=validMonth(req.query.month)?req.query.month:localDateVN().slice(0,7);
    const r=await pool.query(`SELECT pi.*,pp.month_key,pp.status period_status,pp.closed_at,pa.bank_code,pa.bank_account,pa.account_name
      FROM payroll_items pi JOIN payroll_periods pp ON pp.id=pi.period_id LEFT JOIN payroll_accounts pa ON pa.user_id=pi.user_id
      WHERE pi.user_id=$1 AND pp.month_key=$2`,[req.user.sub,month]);
    res.json(r.rows[0]||null);
  }catch(e){next(e)}
});

router.get('/admin/attendance',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=validMonth(req.query.month)?req.query.month:localDateVN().slice(0,7);
    const r=await pool.query(`SELECT a.*,u.full_name,u.email,u.role,u.payroll_daily_rate,u.payroll_monthly_salary,u.housing_allowance,u.transport_allowance,u.attendance_bonus,u.insurance_employee,u.insurance_employer
      FROM attendance_records a JOIN users u ON u.id=a.user_id
      WHERE u.role IN ('STAFF','RECEPTIONIST') AND a.work_date >= ($1||'-01')::date
      AND a.work_date < (($1||'-01')::date + INTERVAL '1 month') ORDER BY a.work_date DESC,u.full_name`,[month]);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.patch('/admin/attendance/:id',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const {clockIn,clockOut,note}=req.body;
    const current=(await pool.query(`SELECT a.*,u.full_name,u.role
      FROM attendance_records a JOIN users u ON u.id=a.user_id
      WHERE a.id=$1 AND u.role IN ('STAFF','RECEPTIONIST')`,[req.params.id])).rows[0];
    if(!current) return res.status(404).json({message:'Không tìm thấy bản ghi chấm công'});
    const month=String(current.work_date).slice(0,7);
    const period=(await pool.query(`SELECT status FROM payroll_periods WHERE month_key=$1`,[month])).rows[0];
    if(period?.status==='CLOSED') return res.status(409).json({message:'Tháng chấm công đã chốt, không thể sửa'});
    const parsedIn = clockIn ? new Date(clockIn) : null;
    const parsedOut = clockOut ? new Date(clockOut) : null;
    if ((parsedIn && Number.isNaN(parsedIn.getTime())) || (parsedOut && Number.isNaN(parsedOut.getTime()))) {
      return res.status(400).json({message:'Giờ chấm công không hợp lệ'});
    }
    if (parsedIn && parsedOut && parsedOut < parsedIn) return res.status(400).json({message:'Giờ ra phải bằng hoặc sau giờ vào'});
    const r=await pool.query(`UPDATE attendance_records SET clock_in=$1,clock_out=$2,note=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,[
      parsedIn, parsedOut, note==null ? current.note : String(note).slice(0,500), req.params.id
    ]);
    await log(req.user.sub,'ATTENDANCE_UPDATED','ATTENDANCE',current.id,{userId:current.user_id,workDate:current.work_date,clockIn:clockIn||null,clockOut:clockOut||null});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.get('/admin/payroll',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=validMonth(req.query.month)?req.query.month:localDateVN().slice(0,7);
    const r=await pool.query(`SELECT u.id user_id,u.full_name,u.email,u.role,
      u.payroll_daily_rate,u.payroll_monthly_salary,u.housing_allowance,u.transport_allowance,u.attendance_bonus,u.insurance_employee,u.insurance_employer,
      pa.bank_code,pa.bank_account,pa.account_name,
      pi.id payroll_item_id,pi.work_days,pi.total_hours,pi.daily_rate,pi.monthly_salary,pi.housing_allowance,pi.transport_allowance,pi.attendance_bonus,pi.insurance_employee,pi.insurance_employer,pi.gross_amount,pi.net_amount,pi.employer_cost,pi.payment_status,pi.paid_at,pi.paid_by,pi.payment_note,
      pp.status period_status,pp.closed_at
      FROM users u LEFT JOIN payroll_accounts pa ON pa.user_id=u.id
      LEFT JOIN payroll_items pi ON pi.user_id=u.id AND pi.period_id=(SELECT id FROM payroll_periods WHERE month_key=$1 LIMIT 1)
      LEFT JOIN payroll_periods pp ON pp.id=pi.period_id
      WHERE u.role IN ('STAFF','RECEPTIONIST') AND u.is_active=true ORDER BY u.full_name`,[month]);
    res.json({month,items:r.rows});
  }catch(e){next(e)}
});

router.patch('/admin/payroll/package/:userId',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const fields={
      monthlySalary:Number(req.body.monthlySalary),
      housingAllowance:Number(req.body.housingAllowance||0),
      transportAllowance:Number(req.body.transportAllowance||0),
      attendanceBonus:Number(req.body.attendanceBonus||0),
      insuranceEmployee:Number(req.body.insuranceEmployee||0),
      insuranceEmployer:Number(req.body.insuranceEmployer||0)
    };
    if(!Object.values(fields).every(Number.isFinite) || Object.values(fields).some(v=>v<0)) return res.status(400).json({message:'Lương/phụ cấp/bảo hiểm không hợp lệ'});
    const r=await pool.query(`UPDATE users SET payroll_monthly_salary=$1,housing_allowance=$2,transport_allowance=$3,attendance_bonus=$4,insurance_employee=$5,insurance_employer=$6,updated_at=NOW() WHERE id=$7 AND role IN ('STAFF','RECEPTIONIST') AND is_active=true RETURNING id,full_name,role,payroll_monthly_salary,housing_allowance,transport_allowance,attendance_bonus,insurance_employee,insurance_employer`,[
      fields.monthlySalary,fields.housingAllowance,fields.transportAllowance,fields.attendanceBonus,fields.insuranceEmployee,fields.insuranceEmployer,req.params.userId
    ]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy nhân viên/lễ tân'});
    await log(req.user.sub,'PAYROLL_PACKAGE_UPDATED','USER',req.params.userId,fields);
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

// Giữ endpoint cũ để tương thích dữ liệu cũ; mức công/ngày không còn là cách tính chính.
router.patch('/admin/payroll/rate/:userId',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const rate=Number(req.body.dailyRate);
    if(!Number.isFinite(rate)||rate<0) return res.status(400).json({message:'Mức công/ngày không hợp lệ'});
    const r=await pool.query(`UPDATE users SET payroll_daily_rate=$1 WHERE id=$2 AND role IN ('STAFF','RECEPTIONIST') RETURNING id,full_name,payroll_daily_rate`,[rate,req.params.userId]);
    if(!r.rowCount) return res.status(404).json({message:'Không tìm thấy nhân viên/lễ tân'});
    await log(req.user.sub,'PAYROLL_RATE_UPDATED','USER',req.params.userId,{dailyRate:rate});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});

router.post('/admin/payroll/close',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  const c=await pool.connect();
  try{
    const month=String(req.body.month||'');
    if(!validMonth(month)) return res.status(400).json({message:'Tháng chốt công không hợp lệ'});
    await c.query('BEGIN');
    const existing=(await c.query(`SELECT * FROM payroll_periods WHERE month_key=$1 FOR UPDATE`,[month])).rows[0];
    if(existing?.status==='CLOSED'){await c.query('ROLLBACK');return res.status(409).json({message:'Tháng này đã được chốt công'});}
    let period=existing;
    if(!period) period=(await c.query(`INSERT INTO payroll_periods(month_key,status) VALUES($1,'OPEN') RETURNING *`,[month])).rows[0];
    const rows=(await c.query(`SELECT u.id,u.payroll_daily_rate,u.payroll_monthly_salary,u.housing_allowance,u.transport_allowance,u.attendance_bonus,u.insurance_employee,u.insurance_employer,
      COUNT(a.id) FILTER (WHERE a.clock_in IS NOT NULL)::int work_days,
      COALESCE(SUM(EXTRACT(EPOCH FROM (a.clock_out-a.clock_in))/3600) FILTER (WHERE a.clock_in IS NOT NULL AND a.clock_out IS NOT NULL),0)::numeric total_hours
      FROM users u LEFT JOIN attendance_records a ON a.user_id=u.id AND a.work_date >= ($1||'-01')::date AND a.work_date < (($1||'-01')::date + INTERVAL '1 month')
      WHERE u.role IN ('STAFF','RECEPTIONIST') AND u.is_active=true GROUP BY u.id`,[month])).rows;
    for(const row of rows){
      const days=Number(row.work_days||0),hours=Number(row.total_hours||0),legacyRate=Number(row.payroll_daily_rate||0);
      const monthlySalary=Number(row.payroll_monthly_salary||0) || days*legacyRate;
      const housing=Number(row.housing_allowance||0),transport=Number(row.transport_allowance||0),attendanceBonus=Number(row.attendance_bonus||0);
      const insuranceEmployee=Number(row.insurance_employee||0),insuranceEmployer=Number(row.insurance_employer||0);
      const gross=monthlySalary+housing+transport+attendanceBonus;
      const net=Math.max(0,gross-insuranceEmployee);
      const employerCost=gross+insuranceEmployer;
      await c.query(`INSERT INTO payroll_items(period_id,user_id,work_days,total_hours,daily_rate,monthly_salary,housing_allowance,transport_allowance,attendance_bonus,insurance_employee,insurance_employer,gross_amount,net_amount,employer_cost)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT(period_id,user_id) DO UPDATE SET work_days=EXCLUDED.work_days,total_hours=EXCLUDED.total_hours,daily_rate=EXCLUDED.daily_rate,monthly_salary=EXCLUDED.monthly_salary,housing_allowance=EXCLUDED.housing_allowance,transport_allowance=EXCLUDED.transport_allowance,attendance_bonus=EXCLUDED.attendance_bonus,insurance_employee=EXCLUDED.insurance_employee,insurance_employer=EXCLUDED.insurance_employer,gross_amount=EXCLUDED.gross_amount,net_amount=EXCLUDED.net_amount,employer_cost=EXCLUDED.employer_cost`,[period.id,row.id,days,hours,legacyRate,monthlySalary,housing,transport,attendanceBonus,insuranceEmployee,insuranceEmployer,gross,net,employerCost]);
    }
    const closed=(await c.query(`UPDATE payroll_periods SET status='CLOSED',closed_at=NOW(),closed_by=$1 WHERE id=$2 RETURNING *`,[req.user.sub,period.id])).rows[0];
    await c.query('COMMIT');
    await log(req.user.sub,'PAYROLL_MONTH_CLOSED','PAYROLL_PERIOD',period.id,{month});
    res.json(closed);
  }catch(e){await c.query('ROLLBACK').catch(()=>{});next(e)}finally{c.release()}
});

router.post('/admin/payroll/:itemId/pay',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const note=String(req.body.note||'').trim();
    const current=(await pool.query(`SELECT pi.*,pp.month_key,pp.status period_status FROM payroll_items pi JOIN payroll_periods pp ON pp.id=pi.period_id WHERE pi.id=$1`,[req.params.itemId])).rows[0];
    if(!current) return res.status(404).json({message:'Không tìm thấy bảng lương'});
    if(current.period_status!=='CLOSED') return res.status(400).json({message:'Chỉ được thanh toán sau khi đã chốt công'});
    if(current.payment_status==='PAID') return res.status(409).json({message:'Khoản lương này đã được thanh toán'});
    const r=await pool.query(`UPDATE payroll_items SET payment_status='PAID',paid_at=NOW(),paid_by=$1,payment_note=$2 WHERE id=$3 AND payment_status='UNPAID' RETURNING *`,[req.user.sub,note||null,req.params.itemId]);
    await log(req.user.sub,'PAYROLL_PAID','PAYROLL_ITEM',current.id,{month:current.month_key,userId:current.user_id,amount:current.net_amount});
    res.json(r.rows[0]);
  }catch(e){next(e)}
});


// Xuất báo cáo Excel dạng SpreadsheetML 2003 (.xls), không cần thư viện ngoài.
// Excel mở trực tiếp file này và giữ đúng hàng/cột theo từng trường dữ liệu.
const xmlEscape=(v='')=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const excelCell=(value,type)=>`<Cell><Data ss:Type="${type}">${xmlEscape(value ?? '')}</Data></Cell>`;
const excelSheet=(name,headers,rows)=>{
  const head=`<Row>${headers.map(h=>excelCell(h,'String')).join('')}</Row>`;
  const body=rows.map(row=>`<Row>${headers.map((_,i)=>{const v=Array.isArray(row)?row[i]:row[headers[i]]; return excelCell(v ?? '', typeof v==='number' && Number.isFinite(v)?'Number':'String')}).join('')}</Row>`).join('');
  return `<Worksheet ss:Name="${xmlEscape(name.slice(0,31))}"><Table>${head}${body}</Table></Worksheet>`;
};
const excelWorkbook=(sheets)=>`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#EDE3D3" ss:Pattern="Solid"/></Style></Styles>
${sheets.map(x=>x.replace('<Row>','<Row ss:StyleID="Header">')).join('')}
</Workbook>`;

async function getReportWorkbookData(month){
  const revenue=(await pool.query(`SELECT date_trunc('day',paid_at) bucket,SUM(amount)::numeric total,COUNT(*)::int count
    FROM payments WHERE status='SUCCESS' AND type IN ('DEPOSIT','BALANCE') AND paid_at IS NOT NULL
    GROUP BY bucket ORDER BY bucket DESC LIMIT 366`)).rows;
  const payments=(await pool.query(`SELECT p.paid_at,p.created_at,p.booking_id,p.type,p.provider,p.amount,p.status,b.booking_code,u.full_name customer,r.room_number
    FROM payments p JOIN bookings b ON b.id=p.booking_id LEFT JOIN users u ON u.id=b.customer_id LEFT JOIN rooms r ON r.id=b.room_id
    ORDER BY COALESCE(p.paid_at,p.created_at) DESC LIMIT 1000`)).rows;
  const finance=(await pool.query(`WITH thu AS (
      SELECT date_trunc('month',paid_at) bucket,SUM(amount)::numeric income
      FROM payments WHERE status='SUCCESS' AND type IN ('DEPOSIT','BALANCE') AND paid_at IS NOT NULL GROUP BY 1
    ), chi AS (
      SELECT date_trunc('month',pi.paid_at) bucket,SUM(COALESCE(pi.employer_cost,pi.gross_amount))::numeric payroll_expense
      FROM payroll_items pi WHERE pi.payment_status='PAID' AND pi.paid_at IS NOT NULL GROUP BY 1
    ) SELECT COALESCE(t.bucket,c.bucket) bucket,COALESCE(t.income,0)::numeric income,COALESCE(c.payroll_expense,0)::numeric payroll_expense,
      (COALESCE(t.income,0)-COALESCE(c.payroll_expense,0))::numeric net
      FROM thu t FULL OUTER JOIN chi c ON c.bucket=t.bucket ORDER BY bucket DESC LIMIT 24`)).rows;
  const attendance=(await pool.query(`SELECT a.work_date,a.clock_in,a.clock_out,
      ROUND(EXTRACT(EPOCH FROM (a.clock_out-a.clock_in))/3600.0,2)::numeric total_hours,
      u.full_name,u.email,u.role,a.note
      FROM attendance_records a JOIN users u ON u.id=a.user_id
      WHERE a.work_date >= ($1||'-01')::date AND a.work_date < (($1||'-01')::date + INTERVAL '1 month')
      ORDER BY a.work_date,u.full_name`,[month])).rows;
  const checkinOut=(await pool.query(`SELECT b.booking_code,u.full_name customer,r.room_number,
      b.check_in,b.actual_check_in,b.check_out,b.actual_check_out,b.status
      FROM bookings b
      LEFT JOIN users u ON u.id=b.customer_id
      JOIN rooms r ON r.id=b.room_id
      WHERE (b.actual_check_in IS NOT NULL AND b.actual_check_in >= ($1||'-01')::date AND b.actual_check_in < (($1||'-01')::date + INTERVAL '1 month'))
         OR (b.actual_check_out IS NOT NULL AND b.actual_check_out >= ($1||'-01')::date AND b.actual_check_out < (($1||'-01')::date + INTERVAL '1 month'))
      ORDER BY COALESCE(b.actual_check_in,b.actual_check_out) DESC,b.booking_code`,[month])).rows;
  const payroll=(await pool.query(`SELECT u.full_name,u.email,u.role,pa.bank_code,pa.bank_account,pa.account_name,
      pi.work_days,pi.total_hours,pi.daily_rate,pi.gross_amount,pi.payment_status,pi.paid_at,pi.payment_note
      FROM payroll_items pi JOIN users u ON u.id=pi.user_id LEFT JOIN payroll_accounts pa ON pa.user_id=pi.user_id
      JOIN payroll_periods pp ON pp.id=pi.period_id WHERE pp.month_key=$1 ORDER BY u.role,u.full_name`,[month])).rows;
  return {revenue,payments,finance,attendance,checkinOut,payroll};
}

const xlsResponse=(res,filename,xml)=>{res.status(200).set({'Content-Type':'application/vnd.ms-excel; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`}).send(xml)};

router.get('/admin/reports/export.xls',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
    const d=await getReportWorkbookData(month);
    const sheets=[
      excelSheet('Doanh thu',['Ngày','Doanh thu','Số giao dịch'],d.revenue.map(x=>[new Date(x.bucket).toLocaleDateString('vi-VN'),Number(x.total),Number(x.count)])),
      excelSheet('Thu chi',['Tháng','Thu từ thanh toán','Chi lương đã trả','Chênh lệch'],d.finance.map(x=>[new Date(x.bucket).toLocaleDateString('vi-VN',{month:'2-digit',year:'numeric'}),Number(x.income),Number(x.payroll_expense),Number(x.net)])),
      excelSheet('Thanh toán',['Thời gian','Mã booking','Khách hàng','Phòng','Loại thanh toán','Phương thức','Số tiền','Trạng thái'],d.payments.map(x=>[x.paid_at||x.created_at,x.booking_code,x.customer||'',x.room_number||'',x.type,x.provider,Number(x.amount),x.status])),
      excelSheet('Chấm công',['Ngày','Nhân viên','Email','Vai trò','Giờ vào','Giờ ra','Tổng giờ','Ghi chú'],d.attendance.map(x=>[x.work_date,x.full_name,x.email,x.role,x.clock_in||'',x.clock_out||'',Number(x.total_hours||0),x.note||''])),
      excelSheet('Check-in out',['Mã booking','Khách hàng','Phòng','Nhận phòng dự kiến','Giờ check-in thực tế','Trả phòng dự kiến','Giờ check-out thực tế','Trạng thái'],d.checkinOut.map(x=>[x.booking_code,x.customer||'',x.room_number||'',x.check_in||'',x.actual_check_in||'',x.check_out||'',x.actual_check_out||'',x.status||''])),
      excelSheet('Lương '+month,['Nhân viên','Email','Vai trò','Ngân hàng','Số tài khoản','Chủ tài khoản','Ngày công','Tổng giờ','Mức công/ngày','Lương','Trạng thái','Ngày trả','Ghi chú'],d.payroll.map(x=>[x.full_name,x.email,x.role,x.bank_code||'',x.bank_account||'',x.account_name||'',Number(x.work_days||0),Number(x.total_hours||0),Number(x.daily_rate||0),Number(x.gross_amount||0),x.payment_status,x.paid_at||'',x.payment_note||'']))
    ];
    xlsResponse(res,`LUXORA-Bao-cao-${month}.xls`,excelWorkbook(sheets));
  }catch(e){next(e)}
});

router.get('/admin/reports/attendance.xls',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
    const d=await getReportWorkbookData(month);
    const xml=excelWorkbook([excelSheet('Chấm công',['Ngày','Nhân viên','Email','Vai trò','Giờ vào','Giờ ra','Tổng giờ','Ghi chú'],d.attendance.map(x=>[x.work_date,x.full_name,x.email,x.role,x.clock_in||'',x.clock_out||'',Number(x.total_hours||0),x.note||'']))]);
    xlsResponse(res,`LUXORA-Cham-cong-${month}.xls`,xml);
  }catch(e){next(e)}
});

router.get('/admin/reports/checkin-out.xls',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
    const d=await getReportWorkbookData(month);
    const xml=excelWorkbook([excelSheet('Check-in out',['Mã booking','Khách hàng','Phòng','Nhận phòng dự kiến','Giờ check-in thực tế','Trả phòng dự kiến','Giờ check-out thực tế','Trạng thái'],d.checkinOut.map(x=>[x.booking_code,x.customer||'',x.room_number||'',x.check_in||'',x.actual_check_in||'',x.check_out||'',x.actual_check_out||'',x.status||'']))]);
    xlsResponse(res,`LUXORA-Checkin-Checkout-${month}.xls`,xml);
  }catch(e){next(e)}
});

router.get('/admin/reports/finance',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`WITH thu AS (
      SELECT date_trunc('month',paid_at) bucket,SUM(amount)::numeric income
      FROM payments WHERE status='SUCCESS' AND type IN ('DEPOSIT','BALANCE') AND paid_at IS NOT NULL GROUP BY 1
    ), chi AS (
      SELECT date_trunc('month',pi.paid_at) bucket,SUM(COALESCE(pi.employer_cost,pi.gross_amount))::numeric payroll_expense
      FROM payroll_items pi WHERE pi.payment_status='PAID' AND pi.paid_at IS NOT NULL GROUP BY 1
    ) SELECT COALESCE(t.bucket,c.bucket) bucket,COALESCE(t.income,0)::numeric income,COALESCE(c.payroll_expense,0)::numeric payroll_expense,
      (COALESCE(t.income,0)-COALESCE(c.payroll_expense,0))::numeric net
      FROM thu t FULL OUTER JOIN chi c ON c.bucket=t.bucket ORDER BY bucket DESC LIMIT 24`);
    res.json(r.rows);
  }catch(e){next(e)}
});

// ---------- Báo cáo (Admin/Manager) ----------
router.get('/admin/reports/bookings',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT b.booking_code,u.full_name customer,r.room_number,b.check_in,b.actual_check_in,b.check_out,b.actual_check_out,
      b.room_price,b.deposit_amount,b.status,COALESCE(i.service_total,0) service_total,COALESCE(i.surcharge,0) surcharge,
      COALESCE(i.grand_total,0) invoice_total,COALESCE(i.remaining_total,0) remaining
      FROM bookings b LEFT JOIN users u ON u.id=b.customer_id JOIN rooms r ON r.id=b.room_id LEFT JOIN invoices i ON i.booking_id=b.id
      ORDER BY b.created_at DESC LIMIT 500`);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.get('/admin/reports/revenue',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const period=['day','month','year'].includes(req.query.period)?req.query.period:'day';
    const months=[1,3,6,12].includes(Number(req.query.months))?Number(req.query.months):1;
    const r=await pool.query(`SELECT date_trunc($1,paid_at) bucket,SUM(amount) total,COUNT(*)::int count
      FROM payments
      WHERE status='SUCCESS' AND type IN ('DEPOSIT','BALANCE') AND paid_at IS NOT NULL
        AND paid_at >= NOW() - ($2 * INTERVAL '1 month')
      GROUP BY bucket ORDER BY bucket DESC
      LIMIT CASE WHEN $1='day' THEN 366 ELSE 60 END`,[period,months]);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.get('/admin/reports/checkinOut',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
    const r=await pool.query(`SELECT b.booking_code,u.full_name customer,r.room_number,b.check_in,b.actual_check_in,b.check_out,b.actual_check_out,b.status
      FROM bookings b LEFT JOIN users u ON u.id=b.customer_id JOIN rooms r ON r.id=b.room_id
      WHERE (b.actual_check_in IS NOT NULL AND b.actual_check_in >= ($1||'-01')::date AND b.actual_check_in < (($1||'-01')::date + INTERVAL '1 month'))
         OR (b.actual_check_out IS NOT NULL AND b.actual_check_out >= ($1||'-01')::date AND b.actual_check_out < (($1||'-01')::date + INTERVAL '1 month'))
      ORDER BY COALESCE(b.actual_check_in,b.actual_check_out) DESC,b.booking_code`,[month]);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.get('/admin/reports/occupancy',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT rt.name room_type,COUNT(DISTINCT r.id)::int rooms,COUNT(b.id)::int bookings
      FROM room_types rt JOIN rooms r ON r.room_type_id=rt.id
      LEFT JOIN bookings b ON b.room_id=r.id AND b.status NOT IN ('CANCELLED')
      GROUP BY rt.name ORDER BY rt.name`);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.get('/admin/reports/customers',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT u.id,u.full_name,u.email,COUNT(b.id)::int bookings,
      COALESCE(SUM(CASE WHEN b.status='COMPLETED' THEN b.room_price ELSE 0 END),0) total_spent
      FROM users u LEFT JOIN bookings b ON b.customer_id=u.id WHERE u.role='CUSTOMER'
      GROUP BY u.id ORDER BY total_spent DESC LIMIT 200`);
    res.json(r.rows);
  }catch(e){next(e)}
});

// Báo cáo riêng các khoản tiền mặt đã được duyệt thành công, lọc theo tháng xác nhận.
router.get('/admin/reports/cash-payments',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
    const r=await pool.query(`SELECT p.id,p.paid_at,p.created_at,p.booking_id,p.type,p.amount,p.status,p.provider,
      b.booking_code,b.status booking_status,u.full_name customer,r.room_number,confirmer.full_name receptionist
      FROM payments p JOIN bookings b ON b.id=p.booking_id LEFT JOIN users u ON u.id=b.customer_id
      LEFT JOIN rooms r ON r.id=b.room_id
      LEFT JOIN LATERAL (SELECT au.full_name FROM audit_logs al LEFT JOIN users au ON au.id=al.actor_user_id
        WHERE al.entity_type='PAYMENT' AND al.entity_id=p.id AND al.action='PAYMENT_CONFIRMED' ORDER BY al.created_at DESC LIMIT 1) confirmer ON TRUE
      WHERE p.status='SUCCESS' AND UPPER(COALESCE(p.provider,''))='CASH'
        AND p.type IN ('DEPOSIT','BALANCE') AND p.paid_at >= ($1||'-01')::date
        AND p.paid_at < (($1||'-01')::date + INTERVAL '1 month')
      ORDER BY p.paid_at DESC`,[month]);
    res.json(r.rows);
  }catch(e){next(e)}
});
router.get('/admin/reports/cash-payments.xls',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
    const r=await pool.query(`SELECT p.paid_at,p.booking_id,p.type,p.amount,p.status,p.provider,b.booking_code,
      u.full_name customer,rm.room_number,confirmer.full_name receptionist
      FROM payments p JOIN bookings b ON b.id=p.booking_id LEFT JOIN users u ON u.id=b.customer_id
      LEFT JOIN rooms rm ON rm.id=b.room_id
      LEFT JOIN LATERAL (SELECT au.full_name FROM audit_logs al LEFT JOIN users au ON au.id=al.actor_user_id
        WHERE al.entity_type='PAYMENT' AND al.entity_id=p.id AND al.action='PAYMENT_CONFIRMED' ORDER BY al.created_at DESC LIMIT 1) confirmer ON TRUE
      WHERE p.status='SUCCESS' AND UPPER(COALESCE(p.provider,''))='CASH' AND p.type IN ('DEPOSIT','BALANCE')
        AND p.paid_at >= ($1||'-01')::date AND p.paid_at < (($1||'-01')::date + INTERVAL '1 month')
      ORDER BY p.paid_at DESC`,[month]);
    const rows=r.rows.map(x=>[x.paid_at,x.booking_code,x.room_number||'',x.customer||'',x.receptionist||'',x.type,Number(x.amount),x.status]);
    rows.push(['TỔNG CỘNG','','','','','',r.rows.reduce((sum,x)=>sum+Number(x.amount||0),0),'Số giao dịch: '+r.rows.length]);
    xlsResponse(res,`LUXORA-Tien-mat-${month}.xls`,excelWorkbook([excelSheet('Thu tiền mặt',['Thời gian xác nhận','Mã booking','Phòng','Khách hàng','Lễ tân xác nhận','Loại thanh toán','Số tiền','Trạng thái'],rows)]));
  }catch(e){next(e)}
});

router.get('/admin/reports/payments',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const r=await pool.query(`SELECT p.*,b.booking_code FROM payments p JOIN bookings b ON b.id=p.booking_id
      ORDER BY p.created_at DESC LIMIT 500`);
    res.json(r.rows);
  }catch(e){next(e)}
});

router.post('/admin/rooms/:id/images',auth,roles('ADMIN','MANAGER'),upload.array('images',10),async(req,res,next)=>{
  try{
    const paths=req.files.map(f=>`/uploads/${f.filename}`);
    const r=await pool.query(`UPDATE rooms SET images=images || $1::jsonb WHERE id=$2 RETURNING id,images`,
      [JSON.stringify(paths),req.params.id]);
    res.json(r.rows[0])
  }catch(e){next(e)}
});
router.put('/admin/rooms/:id/images',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const images=req.body?.images;
    if(!Array.isArray(images)||images.some(image=>typeof image!=='string'))return res.status(400).json({message:'Danh sách ảnh không hợp lệ'});
    const current=await pool.query('SELECT images FROM rooms WHERE id=$1',[req.params.id]);
    if(!current.rowCount)return res.status(404).json({message:'Không tìm thấy phòng'});
    const existing=Array.isArray(current.rows[0].images)?current.rows[0].images:[];
    if(images.length!==existing.length||new Set(images).size!==existing.length||images.some(image=>!existing.includes(image)))return res.status(400).json({message:'Chỉ có thể sắp xếp các ảnh hiện có'});
    const result=await pool.query('UPDATE rooms SET images=$1::jsonb WHERE id=$2 RETURNING id,images',[JSON.stringify(images),req.params.id]);
    res.json(result.rows[0]);
  }catch(e){next(e)}
});
router.delete('/admin/rooms/:id/images/:index',auth,roles('ADMIN','MANAGER'),async(req,res,next)=>{
  try{
    const index=Number(req.params.index);
    const current=await pool.query('SELECT images FROM rooms WHERE id=$1',[req.params.id]);
    if(!current.rowCount)return res.status(404).json({message:'Không tìm thấy phòng'});
    const images=Array.isArray(current.rows[0].images)?[...current.rows[0].images]:[];
    if(!Number.isInteger(index)||index<0||index>=images.length)return res.status(400).json({message:'Vị trí ảnh không hợp lệ'});
    images.splice(index,1);
    const result=await pool.query('UPDATE rooms SET images=$1::jsonb WHERE id=$2 RETURNING id,images',[JSON.stringify(images),req.params.id]);
    res.json(result.rows[0]);
  }catch(e){next(e)}
});
