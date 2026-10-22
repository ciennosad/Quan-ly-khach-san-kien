const photoUrl = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=85`;
const roomGalleries = {
  standard: [photoUrl('photo-1566665797739-1674de7a421a'), photoUrl('photo-1582719478250-c89cae4dc85b'), photoUrl('photo-1578683010236-d716f9a3f461'), photoUrl('photo-1590490360182-c33d57733427')],
  double: [photoUrl('photo-1564501049412-61c2a3083791'), photoUrl('photo-1590490360182-c33d57733427'), photoUrl('photo-1582719478250-c89cae4dc85b'), photoUrl('photo-1566665797739-1674de7a421a')],
  premiumSingle: [photoUrl('photo-1582719478250-c89cae4dc85b'), photoUrl('photo-1566665797739-1674de7a421a'), photoUrl('photo-1578683010236-d716f9a3f461'), photoUrl('photo-1564501049412-61c2a3083791')],
  premiumDouble: [photoUrl('photo-1564501049412-61c2a3083791'), photoUrl('photo-1582719478250-c89cae4dc85b'), photoUrl('photo-1590490360182-c33d57733427'), photoUrl('photo-1578683010236-d716f9a3f461')],
  family: [photoUrl('photo-1590490360182-c33d57733427'), photoUrl('photo-1564501049412-61c2a3083791'), photoUrl('photo-1566665797739-1674de7a421a'), photoUrl('photo-1582719478250-c89cae4dc85b')],
  group: [photoUrl('photo-1578683010236-d716f9a3f461'), photoUrl('photo-1590490360182-c33d57733427'), photoUrl('photo-1564501049412-61c2a3083791'), photoUrl('photo-1582719478250-c89cae4dc85b')],
};

// Ảnh minh họa đồng nhất giữa thẻ phòng và trang đặt phòng; ảnh quản lý tải lên được ưu tiên.
export function getRoomGallery(room) {
  const uploaded = Array.isArray(room?.images) ? room.images.filter(Boolean) : [];
  if (uploaded.length) return uploaded;
  const type = `${room?.room_type_name || ''} ${room?.description || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/5\s*(?:giuong|bed)|tap the|dorm/.test(type)) return roomGalleries.group;
  if (/family|gia dinh/.test(type)) return roomGalleries.family;
  if (/cao cap|premium|suite|deluxe/.test(type)) return /2\s*(?:giuong|bed)|suite|sofa rieng|twin|double/.test(type) ? roomGalleries.premiumDouble : roomGalleries.premiumSingle;
  if (/double|twin|phong doi|2\s*(?:giuong|bed)/.test(type)) return roomGalleries.double;
  return roomGalleries.standard;
}