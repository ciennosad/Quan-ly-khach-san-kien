import React from 'react';

export default function HeroCrest({ className = '' }) {
  return <svg className={className} viewBox="0 0 140 80" role="img" aria-label="Huy hiệu HERO HOTEL" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor">
      <path d="M53 30C39 22 22 14 4 12C10 25 21 32 37 36C25 34 14 34 4 36C14 46 27 49 42 47C33 52 24 53 17 53C28 62 42 61 54 55L60 46L53 30Z"/>
      <path d="M87 30C101 22 118 14 136 12C130 25 119 32 103 36C115 34 126 34 136 36C126 46 113 49 98 47C107 52 116 53 123 53C112 62 98 61 86 55L80 46L87 30Z"/>
      <path d="M55 27L57 16L64 22L70 10L76 22L83 16L85 27L81 31H59L55 27Z"/>
      <circle cx="57" cy="15" r="2.4"/><circle cx="70" cy="9" r="2.6"/><circle cx="83" cy="15" r="2.4"/>
    </g>
    <path d="M55 31C64 27 76 27 85 31L82 53C79 62 74 68 70 71C66 68 61 62 58 53L55 31Z" fill="#FFFDFA" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/>
    <g stroke="#FFFDFA" strokeWidth="1.5" strokeLinecap="round" opacity=".92">
      <path d="M12 19C24 24 35 28 47 34"/><path d="M9 37C23 39 34 41 48 44"/><path d="M24 54C34 55 42 53 51 49"/>
      <path d="M128 19C116 24 105 28 93 34"/><path d="M131 37C117 39 106 41 92 44"/><path d="M116 54C106 55 98 53 89 49"/>
    </g>
  </svg>;
}
