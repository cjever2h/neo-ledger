/* 결제 문자 / 알림 / 영수증 OCR 텍스트 파서 + 카테고리 자동 분류 */
(function (global) {
  const CATS = {
    expense: ['식비', '카페·간식', '교통', '쇼핑', '주거·통신', '의료·운동', '문화·여가', '교육·도서', '경조·선물', '금융·보험', '기타'],
    income: ['급여', '부수입', '이자·배당', '환불', '기타수입'],
    invest: ['주식·ETF', '코인', '연금·적금', '기타투자']
  };

  // [type, category, regex] 위에서부터 먼저 맞는 규칙을 사용
  const RULES = [
    ['invest', '코인', /업비트|빗썸|코인원|코빗|upbit|bithumb|coinone/i],
    ['invest', '연금·적금', /연금저축|IRP|퇴직연금|적금|청약|ISA|펀드/i],
    ['invest', '주식·ETF', /증권|키움|미래에셋|ETF|NH투자|한국투자|대신증권|주식|해외주식|브로커리지/i],
    ['income', '급여', /급여|월급|상여|보너스|성과급|PAYDAY/i],
    ['income', '이자·배당', /이자입금|배당|이자수익|예금이자|결산이자/],
    ['income', '환불', /환불|승인취소|결제취소|취소/],
    ['expense', '카페·간식', /스타벅스|투썸|이디야|메가커피|메가MGC|컴포즈|빽다방|할리스|엔제리너스|폴바셋|블루보틀|카페|커피|COFFEE|CAFE|베이커리|파리바게|뚜레쥬르|던킨|배스킨|아이스크림|디저트|제과|빵|마카롱|케이크|아메리카노|라떼|스무디|와플|도넛|쿠키/i],
    ['expense', '식비', /배달의민족|배민|요기요|쿠팡이츠|맥도날드|롯데리아|버거킹|맘스터치|KFC|서브웨이|김밥|식당|치킨|피자|국밥|이마트|홈플러스|롯데마트|하나로마트|GS25|CU\b|세븐일레븐|이마트24|미니스톱|편의점|반찬|정육|푸드|분식|족발|곱창|횟집|고기|삼겹|한식|중식|일식|양식|레스토랑|뷔페|막창|보쌈|찌개|비빔밥|돈까스|짜장|라면|떡볶이|순대|햄버거|샐러드|도시락|밥집|국수|냉면|마트|식자재|수산|농산|과일|야채|채소|한우|술집|호프|주점|포차|이자카야|맥주|와인바/i],
    ['expense', '교통', /티머니|T-?money|지하철|서울교통|버스|택시|카카오T|카카오모빌|우티|UT\b|코레일|KTX|SRT|주유|SK에너지|GS칼텍스|S-?OIL|에쓰오일|현대오일뱅크|오일뱅크|주차|하이패스|톨게이트|도로공사|따릉이|렌터카|쏘카|그린카|항공|공항|대한항공|아시아나|제주항공|진에어|티웨이|이스타|기차|고속버스|터미널|세차|정비|자동차/i],
    ['expense', '쇼핑', /쿠팡|네이버페이|네이버쇼핑|11번가|G마켓|지마켓|옥션|무신사|올리브영|다이소|아마존|SSG|쓱닷컴|컬리|마켓컬리|위메프|티몬|알리익스프레스|AliExpress|테무|Temu|당근|번개장터|29CM|지그재그|에이블리|오늘의집|이케아|IKEA|백화점|아울렛|유니클로|자라|ZARA|H&M|스파오|탑텐|나이키|아디다스|프로스펙스|쇼핑|MALL|하이마트|전자랜드|애플|APPLE/i],
    ['expense', '주거·통신', /관리비|전기요금|가스요금|수도요금|한국전력|한전|도시가스|KT\b|SKT|SK텔레콤|LG유플러스|LGU\+|통신|월세|인터넷|알뜰폰|헬로모바일|아파트|임대|보증금|난방|지역난방/i],
    ['expense', '의료·운동', /병원|의원|약국|치과|한의원|이비인후과|피부과|정형외과|내과|안과|산부인과|소아과|클리닉|건강검진|헬스|피트니스|PT\b|요가|필라테스|러닝|마라톤|스포츠|런닝|골프|수영|클라이밍|GYM|운동|건강|영양제/i],
    ['expense', '문화·여가', /넷플릭스|NETFLIX|유튜브|YouTube|디즈니|왓챠|티빙|웨이브|CGV|메가박스|롯데시네마|영화|노래방|코인노래|여행|호텔|리조트|에어비앤비|Airbnb|야놀자|여기어때|멜론|스포티파이|Spotify|게임|스팀|STEAM|닌텐도|플레이스테이션|PlayStation|공연|티켓|인터파크|예스24티켓|놀이공원|에버랜드|롯데월드|PC방|볼링|당구|캠핑|낚시/i],
    ['expense', '교육·도서', /교보문고|영풍문고|알라딘|예스24|YES24|밀리의서재|윌라|리디|도서|서점|학원|클래스101|클래스|인강|강의|인프런|유데미|Udemy|패스트캠퍼스|수업료|등록금|교육|과외|독서|책방|문구|아이스크림에듀/i],
    ['expense', '경조·선물', /경조|축의|부조|선물|기프티콘|카카오톡 ?선물|꽃|플라워|화환|조의/i],
    ['expense', '금융·보험', /보험|대출|이자|수수료|카드대금|연회비|연체|캐피탈|할부금|세금|국세|지방세|과태료|범칙금/]
  ];

  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ''); }

  // 사용자 학습 규칙 -> 내장 규칙 순서
  function categorize(text, direction, rules) {
    const raw = String(text || '');
    const n = norm(raw);
    if (rules && rules.length) {
      for (const r of rules) {
        if (r.keyword && n.includes(norm(r.keyword))) return { type: r.type || direction, category: r.category, learned: true };
      }
    }
    for (const [type, cat, re] of RULES) {
      if (re.test(raw)) {
        if (direction === 'income' && type !== 'income') continue;
        if (direction !== 'income' && type === 'income') continue;
        return { type, category: cat, learned: false };
      }
    }
    if (direction === 'income') return { type: 'income', category: '기타수입', learned: false };
    return { type: direction === 'invest' ? 'invest' : 'expense', category: direction === 'invest' ? '기타투자' : '기타', learned: false };
  }

  function toInt(s) { return parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0; }

  function pad(n) { return String(n).padStart(2, '0'); }

  // 텍스트에서 날짜/시간 추출 -> Date | null
  function extractDate(text, now) {
    now = now || new Date();
    let y, mo, d, h = null, mi = null, hadYear = false, found = false;
    let m;
    if ((m = text.match(/(20\d{2})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; hadYear = true; found = true; }
    else if ((m = text.match(/(?:^|[^\d])(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?!\d)/)) && +m[1] >= 20 && +m[1] <= 40 && +m[2] <= 12 && +m[3] <= 31) { y = 2000 + +m[1]; mo = +m[2]; d = +m[3]; hadYear = true; found = true; }
    else if ((m = text.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?!\d)/)) && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) { mo = +m[1]; d = +m[2]; found = true; }
    else if ((m = text.match(/(\d{1,2})월\s*(\d{1,2})일/))) { mo = +m[1]; d = +m[2]; found = true; }
    const t = text.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (t && +t[1] < 24 && +t[2] < 60) { h = +t[1]; mi = +t[2]; }
    if (!found && h === null) return null;
    if (!found) { y = now.getFullYear(); mo = now.getMonth() + 1; d = now.getDate(); }
    if (!hadYear) {
      y = now.getFullYear();
      const test = new Date(y, mo - 1, d, 12, 0);
      if (test.getTime() - now.getTime() > 2 * 86400000) y -= 1;
    }
    const dt = new Date(y, mo - 1, d, h === null ? 12 : h, mi === null ? 0 : mi);
    if (isNaN(dt.getTime())) return null;
    return dt;
  }

  function extractAccount(chunk) {
    let m = chunk.match(/([가-힣A-Za-z]*카드)\s*\(?(\d{3,4})\)?/);
    if (m) return m[1] + '(' + m[2] + ')';
    m = chunk.match(/\[([^\]\n]{2,12})\]/);
    if (m && !/Web|발신|광고/.test(m[1])) return m[1];
    m = chunk.match(/([가-힣A-Za-z]*카드)/);
    if (m) return m[1];
    return '';
  }

  const STOP = /(승인취소|결제취소|해외승인|해외결제|자동이체|체크카드|신용카드|일시불|무이자|승인|결제|출금|입금|이체|사용|체크|신용|할부|\d+\s*개월|취소|누적|잔액|잔여|한도|정상|처리|완료|안내|Web발신|광고|확인|고객님|님\b|감사합니다|에서)/g;

  function extractMerchant(chunk) {
    // 토스/카카오페이 알림: "OO에서 5,800원 결제"
    let m = chunk.match(/([가-힣A-Za-z0-9&·.\-()]+(?: [가-힣A-Za-z0-9&·.\-()]+){0,3})에서\s*[\d,]+\s*원\s*(?:결제|사용|출금|승인)/);
    if (m) return m[1].replace(/^(토스뱅크|토스|카카오페이|카카오뱅크|네이버페이|삼성페이)\s*[·•|]?\s*/, '').replace(/^(결제|승인|출금)\s*/, '').trim().slice(0, 30);
    let s = chunk;
    s = s.replace(/\[Web ?발신\]|\(광고\)|\(주\)|㈜|주식회사/g, ' ');
    s = s.replace(/\[[^\]\n]*\]/g, ' ');
    s = s.replace(/(잔액|누적|한도|잔여|잔고|가용)\s*[:：]?\s*[\d,]+\s*원?/g, ' ');
    s = s.replace(/(승인|결제|사용)\s+[가-힣*]{2,4}\s*님?\s+(?=[\d,]+\s*원)/g, '$1 ');
    s = s.replace(/[가-힣*]{2,4}\s*님/g, ' ');
    s = s.replace(/20\d{2}[-./년]\s*\d{1,2}[-./월]\s*\d{1,2}일?|\d{2}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\/\d{1,2}|\d{1,2}월\s*\d{1,2}일|\d{1,2}:\d{2}(:\d{2})?/g, ' ');
    s = s.replace(/[가-힣A-Za-z]*카드\s*\(?\d{0,4}\)?/g, ' ');
    s = s.replace(/\d{2,}[-*]+[\d*-]+/g, ' ');
    s = s.replace(/\*+\d*/g, ' ');
    s = s.replace(/[\d,]+\s*원/g, ' ');
    s = s.replace(/USD|KRW|JPY|EUR|[\d.]+\s*(달러|엔)/g, ' ');
    s = s.replace(STOP, ' ');
    s = s.replace(/[()\[\]{}:：|·\-–—,]/g, ' ');
    const toks = s.split(/\s+/).filter(t => t && !/^[\d.*]+$/.test(t) && t.length > 0);
    // 은행/카드사 이름만 남은 토큰 제거
    const bank = /^(KB|NH|BC|IBK|SC|KEB)?(국민|신한|우리|하나|농협|기업|카카오뱅크|카카오페이|토스뱅크|토스|케이뱅크|삼성|현대|롯데|씨티|새마을|우체국|신협|수협|은행)$/;
    const out = toks.filter(t => !bank.test(t));
    return out.join(' ').trim().slice(0, 30);
  }

  function detectDirection(chunk) {
    if (/승인\s?취소|결제\s?취소|취소\s?승인|환불/.test(chunk)) return 'income';
    if (/출금|승인|결제|사용|이체\s?완료|자동이체|인출/.test(chunk)) return 'expense';
    if (/입금|급여|월급|수신|환급/.test(chunk)) return 'income';
    return 'expense';
  }

  function extractAmount(chunk) {
    let s = chunk.replace(/(잔액|누적|한도|잔여|잔고|가용)\s*[:：]?\s*[\d,]+\s*원?/g, ' ');
    const re = /(?:^|[^\d,.])(\d{1,3}(?:,\d{3})+|\d+)\s*원/g;
    let m; const found = [];
    while ((m = re.exec(s))) found.push(toInt(m[1]));
    if (found.length) return found[0];
    m = s.match(/(?:금액|결제|승인|출금|입금)\s*[:：]?\s*(\d[\d,]*)/);
    if (m) return toInt(m[1]);
    return 0;
  }

  function splitMessages(text) {
    let t = String(text || '').replace(/\r/g, '').trim();
    if (!t) return [];
    let parts = t.split(/\n\s*\n+/);
    const out = [];
    for (const p of parts) {
      const subs = p.split(/(?=\[Web ?발신\])/).map(x => x.trim()).filter(Boolean);
      out.push(...subs);
    }
    return out;
  }

  /** 문자/알림 텍스트(여러 건 가능) -> 거래 후보 배열 */
  function parseMessages(text, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const items = []; let skipped = 0;
    for (const chunk of splitMessages(text)) {
      const amount = extractAmount(chunk);
      if (!amount) { skipped++; continue; }
      const dir = detectDirection(chunk);
      const merchant = extractMerchant(chunk);
      const dt = extractDate(chunk, now);
      const cat = categorize(merchant + ' ' + chunk, dir, opts.rules);
      const account = extractAccount(chunk);
      const needs = !merchant || (cat.category === '기타' && !cat.learned) || !dt;
      items.push({
        occurred_at: (dt || now).toISOString(),
        type: cat.type,
        amount,
        merchant: merchant || '(가맹점 미확인)',
        category: cat.category,
        account,
        memo: '',
        source: opts.source || 'sms',
        raw_text: chunk.slice(0, 500),
        needs_review: needs
      });
    }
    return { items, skipped };
  }

  const TOTAL_RE = /합\s*계|총\s*(?:액|금액|결제)|결제\s*(?:금액|요청|하실)|받을\s*금액|청구\s*금액|카드\s*승인\s*금액|승인\s*금액|TOTAL|AMOUNT|받은\s*금액|판매\s*금액/i;
  const SKIP_RE = /부가세|부가가치|과세|면세|VAT|공급가|거스름|잔돈|포인트|할인|적립|봉사료/i;

  function fixOcrNumbers(line) {
    // OCR 이 쉼표를 점/공백으로 읽는 경우 보정: 12.500 -> 12,500
    return line.replace(/(\d{1,3})[.\s](\d{3})(?!\d)/g, '$1,$2').replace(/[Oo](?=\d{3})/g, '0');
  }

  /** 영수증 OCR 텍스트 -> 거래 후보 1건 */
  function parseReceipt(text, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const lines = String(text || '').split(/\n/).map(l => l.trim()).filter(Boolean);
    const numRe = /(\d{1,3}(?:,\d{3})+|\d{3,})/g;
    const cands = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (TOTAL_RE.test(ln) && !SKIP_RE.test(ln)) {
        const f = fixOcrNumbers(ln);
        let nums = [...f.matchAll(numRe)].map(m => toInt(m[1])).filter(n => n >= 100 && n < 10000000);
        if (!nums.length && lines[i + 1]) nums = [...fixOcrNumbers(lines[i + 1]).matchAll(numRe)].map(m => toInt(m[1])).filter(n => n >= 100 && n < 10000000);
        if (nums.length) cands.push(Math.max(...nums));
      }
    }
    let amount = cands.length ? Math.max(...cands) : 0;
    let sure = !!amount;
    if (!amount) {
      const all = [];
      for (const ln of lines) {
        if (SKIP_RE.test(ln)) continue;
        for (const m of fixOcrNumbers(ln).matchAll(/(\d{1,3}(?:,\d{3})+)/g)) all.push(toInt(m[1]));
      }
      const ok = all.filter(n => n >= 100 && n < 10000000);
      if (ok.length) amount = Math.max(...ok);
    }
    // 가맹점
    let merchant = '';
    for (const ln of lines) {
      const m = ln.match(/(?:상\s*호|가맹점(?:명)?|매장명?|점\s*명)\s*[:：]?\s*(.+)/);
      if (m && m[1].trim().length >= 2) { merchant = m[1].trim(); break; }
    }
    if (!merchant) {
      for (const ln of lines.slice(0, 8)) {
        if (/영수증|사업자|전화|TEL|주소|대표|http|www|\d{3}-\d{2}-\d{5}|신용|카드|승인|일시|날짜|번호/i.test(ln)) continue;
        const clean = ln.replace(/[^가-힣A-Za-z0-9&·\s().]/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean.length >= 2 && /[가-힣A-Za-z]{2,}/.test(clean)) { merchant = clean; break; }
      }
    }
    merchant = merchant.replace(/\s+/g, ' ').slice(0, 30);
    const dt = extractDate(text, now);
    const cat = categorize(merchant + ' ' + lines.join(' '), 'expense', opts.rules);
    return {
      occurred_at: (dt || now).toISOString(),
      type: cat.type === 'income' ? 'expense' : cat.type,
      amount,
      merchant: merchant || '(가맹점 미확인)',
      category: cat.type === 'income' ? '기타' : cat.category,
      account: '',
      memo: '',
      source: opts.source || 'receipt',
      raw_text: String(text || '').slice(0, 800),
      needs_review: true,
      sure
    };
  }

  global.Parser = { CATS, categorize, parseMessages, parseReceipt, extractDate, extractMerchant, extractAmount };
})(typeof window !== 'undefined' ? window : globalThis);
