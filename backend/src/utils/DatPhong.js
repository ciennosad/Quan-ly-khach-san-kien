export function bookingCode() {
  const d=new Date().toISOString().slice(0,10).replaceAll('-','');
  const n=String(Math.floor(Math.random()*10000)).padStart(4,'0');
  return `BK-${d}-${n}`;
}
export const invoiceTotals=({room,services,surcharge,deposit})=>{
  const grand=Number(room)+Number(services)+Number(surcharge);
  return {grandTotal:grand,remainingTotal:Math.max(0,grand-Number(deposit))};
};
