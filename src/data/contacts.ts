export interface Contact {
  id: number;
  first: string;
  last: string;
  title: string;
  company: string;
  website: string;
  linkedin: string;
  email: string;
  phone: string;
  city: string;
  ind: string;
  employees: string;
  signals: string[];
  score: number;
}

export interface IndustryMeta {
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export interface SignalMeta {
  id: string;
  label: string;
  color: string;
}

export const IND_META: Record<string, IndustryMeta> = {
  re:     { label: 'Real Estate',  color: '#38bdf8', bgClass: 'bg-sky-500/10',     textClass: 'text-sky-400',    borderClass: 'border-sky-500/30' },
  con:    { label: 'Construction', color: '#a3e635', bgClass: 'bg-lime-500/10',    textClass: 'text-lime-400',   borderClass: 'border-lime-500/30' },
  law:    { label: 'Legal',        color: '#c084fc', bgClass: 'bg-purple-500/10',  textClass: 'text-purple-400', borderClass: 'border-purple-500/30' },
  fin:    { label: 'Finance',      color: '#fb923c', bgClass: 'bg-orange-500/10',  textClass: 'text-orange-400', borderClass: 'border-orange-500/30' },
  food:   { label: 'Food & Bev',   color: '#f87171', bgClass: 'bg-red-500/10',     textClass: 'text-red-400',    borderClass: 'border-red-500/30' },
  np:     { label: 'Nonprofit',    color: '#34d399', bgClass: 'bg-emerald-500/10', textClass: 'text-emerald-400',borderClass: 'border-emerald-500/30' },
  hos:    { label: 'Hospitality',  color: '#f472b6', bgClass: 'bg-pink-500/10',    textClass: 'text-pink-400',   borderClass: 'border-pink-500/30' },
  biz:    { label: 'Consulting',   color: '#fbbf24', bgClass: 'bg-amber-500/10',   textClass: 'text-amber-400',  borderClass: 'border-amber-500/30' },
  events: { label: 'Events',       color: '#2dd4bf', bgClass: 'bg-teal-500/10',    textClass: 'text-teal-400',   borderClass: 'border-teal-500/30' },
};

export const SIGNALS: SignalMeta[] = [
  { id: 'new_role',    label: 'New role (< 90 days)',  color: '#e8ff47' },
  { id: 'mkt_hire',   label: 'Marketing hiring',       color: '#38bdf8' },
  { id: 'headcount',  label: 'Headcount surge',        color: '#34d399' },
  { id: 'partnership',label: 'New partnership',        color: '#c084fc' },
  { id: 'new_office', label: 'New location / product', color: '#fb923c' },
];

export const CONTACTS: Contact[] = [
  { id:1,  first:'Latanya',  last:'Flix',       title:'SVP, Inclusive Leadership & Opportunity', company:'Greater Houston Partnership',  website:'houston.org',               linkedin:'linkedin.com/in/latanyaflix',               email:'lflix@houston.org',                     phone:'+1 832-362-8918', city:'Houston',       ind:'np',     employees:'201-500', signals:['mkt_hire','headcount'],       score:88 },
  { id:2,  first:'Ranjin',   last:'Mathew',     title:'Senior Vice President',                   company:'Partners Real Estate',         website:'partnersrealestate.com',     linkedin:'linkedin.com/in/ranjinmathew',              email:'ranjin.mathew@partners.com',            phone:'+1 936-414-8404', city:'Houston',       ind:'re',     employees:'51-200',  signals:['new_role','headcount'],       score:82 },
  { id:3,  first:'Amy',      last:'Ivy',        title:'VP, Asset Management',                    company:'Partners Real Estate',         website:'partnersrealestate.com',     linkedin:'linkedin.com/in/amy-ivy-226a5692',          email:'amy.ivy@partnersrealestate.com',         phone:'+1 713-816-4016', city:'Houston',       ind:'re',     employees:'51-200',  signals:['new_role'],                   score:79 },
  { id:4,  first:'Summer',   last:'Reeves',     title:'VP, Regional Workforce Development',      company:'Greater Houston Partnership',  website:'houston.org',               linkedin:'linkedin.com/in/summerreeves',              email:'sreeves@houston.org',                   phone:'+1 832-347-7308', city:'Houston',       ind:'np',     employees:'201-500', signals:['mkt_hire'],                   score:75 },
  { id:5,  first:'Cory',     last:'Burkhalter', title:'VP / Principal',                          company:"O'Donnell Snider Construction",website:'odonnellsnider.com',         linkedin:'linkedin.com/in/cory-burkhalter-1b27b097',  email:'cory@odonnellsnider.com',                phone:'—',               city:'Houston',       ind:'con',    employees:'51-200',  signals:['headcount'],                  score:78 },
  { id:6,  first:'Keith',    last:'Sizemore',   title:'SVP, Franchise Development',              company:'Shipley Do-Nuts',              website:'shipleydonuts.com',          linkedin:'linkedin.com/in/keith-sizemore-85992074',   email:'ksizemore@shipleydonuts.com',            phone:'—',               city:'Houston',       ind:'food',   employees:'201-500', signals:['headcount','mkt_hire'],       score:85 },
  { id:7,  first:'Steven',   last:'Prevost',    title:'Division President & CFO',                company:'Tricoast Homes',               website:'tricoasthomes.com',          linkedin:'linkedin.com/in/stevenprevost',             email:'sprevost@tricoasthomes.com',             phone:'—',               city:'Sugar Land',    ind:'con',    employees:'11-50',   signals:['mkt_hire','headcount'],       score:95 },
  { id:8,  first:'Clint',    last:'Nabors',     title:'Chief Operating Officer',                 company:'Blair Realty Group',           website:'blairrg.com',               linkedin:'linkedin.com/in/clintnabors',               email:'clint@blairrg.com',                     phone:'—',               city:'Cypress',       ind:'re',     employees:'1-10',    signals:['partnership','new_office'],   score:92 },
  { id:9,  first:'David',    last:'Oelfke',     title:'Co-Founder & Managing Principal',         company:'Marble Capital',               website:'marblecapitallp.com',        linkedin:'linkedin.com/in/david-oelfke-40230b19a',    email:'doelfke@marblecapitallp.com',            phone:'—',               city:'Houston',       ind:'fin',    employees:'11-50',   signals:['headcount'],                  score:84 },
  { id:10, first:'Brian',    last:'Manning',    title:'Owner',                                   company:'Political Asylum Lawyers',     website:'politicalasylumlawyers.com', linkedin:'linkedin.com/in/briansmanning',             email:'brian@politicalasylumlawyers.com',       phone:'—',               city:'Houston',       ind:'law',    employees:'11-50',   signals:['headcount','mkt_hire'],       score:88 },
  { id:11, first:'Marcus',   last:'Deleon',     title:'Founder & CEO',                           company:'Bayou Bites Hospitality',      website:'—',                         linkedin:'—',                                         email:'mdeleon@bayoubites.com',                 phone:'+1 713-445-2210', city:'Houston',       ind:'food',   employees:'11-50',   signals:['new_role','new_office'],      score:81 },
  { id:12, first:'Sandra',   last:'Kim',        title:'Director of Marketing',                   company:'Houston Venue Co.',            website:'houstonvenueco.com',         linkedin:'linkedin.com/in/sandrakim-htx',             email:'sandra@houstonvenueco.com',              phone:'+1 832-550-9901', city:'Houston',       ind:'events', employees:'11-50',   signals:['mkt_hire','new_office'],      score:87 },
  { id:13, first:'Jerrod',   last:'Washington', title:'Managing Partner',                        company:'Washington Legal Group',       website:'washingtonlegal.com',        linkedin:'—',                                         email:'jerrod@washingtonlegal.com',             phone:'+1 713-820-3344', city:'Houston',       ind:'law',    employees:'11-50',   signals:['headcount'],                  score:76 },
  { id:14, first:'Patricia', last:'Osei',       title:'Executive Director',                      company:'Houston Arts Alliance',        website:'houstonartsalliance.org',    linkedin:'linkedin.com/in/patriciaosei',              email:'posei@houstonartsalliance.org',          phone:'+1 713-527-9330', city:'Houston',       ind:'np',     employees:'11-50',   signals:['mkt_hire'],                   score:72 },
  { id:15, first:'Carlos',   last:'Vega',       title:'CEO',                                     company:'Vega Construction Partners',   website:'vegacp.com',                linkedin:'linkedin.com/in/carlosvega-htx',            email:'carlos@vegacp.com',                     phone:'+1 281-334-5500', city:'Katy',          ind:'con',    employees:'11-50',   signals:['new_office','headcount'],     score:83 },
  { id:16, first:'Michelle', last:'Tran',       title:'Owner & Founder',                         company:'The Pearl Bridal & Event',     website:'thepearlhtx.com',           linkedin:'linkedin.com/in/michelletran',              email:'michelle@thepearlhtx.com',               phone:'+1 832-441-8800', city:'Houston',       ind:'events', employees:'1-10',    signals:['new_role'],                   score:74 },
  { id:17, first:'Derek',    last:'Holloway',   title:'President',                               company:'Holloway Financial Advisory',  website:'hollowayfinancial.com',      linkedin:'—',                                         email:'derek@hollowayfinancial.com',            phone:'+1 713-981-2200', city:'Sugar Land',    ind:'fin',    employees:'11-50',   signals:['headcount','new_role'],       score:80 },
  { id:18, first:'Aisha',    last:'Mohammed',   title:'CMO',                                     company:'Crescent Hotel Group',         website:'crescenthtx.com',           linkedin:'linkedin.com/in/aishamohammed-htx',         email:'amohammed@crescenthotel.com',            phone:'+1 713-443-7700', city:'Houston',       ind:'hos',    employees:'51-200',  signals:['mkt_hire','new_office'],      score:91 },
  { id:19, first:'James',    last:'Nguyen',     title:'Founder',                                 company:'Pho Republic',                 website:'phorepublic.com',           linkedin:'linkedin.com/in/jamesnguyen-pho',           email:'james@phorepublic.com',                  phone:'+1 281-568-1234', city:'Pearland',      ind:'food',   employees:'11-50',   signals:['new_office'],                 score:77 },
  { id:20, first:'Rebecca',  last:'Sullivan',   title:'VP of Business Development',              company:'Sullivan Property Group',      website:'sullivanpg.com',            linkedin:'linkedin.com/in/rebeccasullivan',           email:'rsullivan@sullivanpg.com',               phone:'+1 832-670-4411', city:'The Woodlands', ind:'re',     employees:'11-50',   signals:['headcount'],                  score:73 },
  { id:21, first:'Tony',     last:'Garrett',    title:'Director, Brand & Communications',        company:'Houston Culinary Concepts',    website:'—',                         linkedin:'—',                                         email:'tgarrett@htxculinary.com',               phone:'+1 713-880-2200', city:'Houston',       ind:'food',   employees:'51-200',  signals:['mkt_hire','headcount'],       score:86 },
  { id:22, first:'Natalie',  last:'Reyes',      title:'Owner',                                   company:'Reyes Consulting Group',       website:'reyescg.com',               linkedin:'linkedin.com/in/nataliereyes-htx',          email:'natalie@reyescg.com',                    phone:'+1 281-560-9900', city:'Missouri City', ind:'biz',    employees:'1-10',    signals:['new_role'],                   score:69 },
  { id:23, first:'Chris',    last:'Park',       title:'CEO',                                     company:'Parkway Hospitality',          website:'parkwayhospitality.com',     linkedin:'linkedin.com/in/chrispark-htx',             email:'chris@parkwayhospitality.com',           phone:'+1 713-221-5500', city:'Houston',       ind:'hos',    employees:'51-200',  signals:['partnership','headcount'],    score:82 },
  { id:24, first:'Helen',    last:'Brooks',     title:'Managing Partner',                        company:'Brooks & Associates Law',      website:'brookslaw.com',             linkedin:'—',                                         email:'hbrooks@brookslaw.com',                  phone:'+1 713-660-8800', city:'Houston',       ind:'law',    employees:'11-50',   signals:['headcount'],                  score:75 },
  { id:25, first:'Ahmad',    last:'Hassan',     title:'Founder & President',                     company:'Gulf Coast Builders',          website:'gulfcoastbuilders.com',      linkedin:'linkedin.com/in/ahmadhassan-gcb',           email:'ahmad@gulfcoastbuilders.com',            phone:'+1 281-443-1100', city:'Pasadena',      ind:'con',    employees:'11-50',   signals:['headcount','new_office'],     score:84 },
  { id:26, first:'Lisa',     last:'Fernandez',  title:'Director of Development',                 company:'HoustonWorks Foundation',      website:'houstonworks.org',           linkedin:'linkedin.com/in/lisafernandez-htx',         email:'lfernandez@houstonworks.org',            phone:'+1 713-529-4400', city:'Houston',       ind:'np',     employees:'11-50',   signals:['mkt_hire'],                   score:71 },
  { id:27, first:'Brandon',  last:'Cole',       title:'Co-Founder',                              company:'Cole Accounting Partners',     website:'coleaccounting.com',         linkedin:'linkedin.com/in/brandoncole-cpa',           email:'brandon@coleaccounting.com',             phone:'+1 281-395-7700', city:'Katy',          ind:'fin',    employees:'1-10',    signals:['new_role'],                   score:66 },
];

// Extend to 120 contacts
const IND_POOL = ['re','con','law','fin','food','np','hos','biz','events','re','con','law'] as const;
const SIG_POOL: string[][] = [
  ['headcount'],['mkt_hire'],['new_role'],['headcount','mkt_hire'],
  ['new_role','new_office'],['partnership'],[],['headcount'],[],['mkt_hire','new_role'],
];
const TITLE_POOL = [
  'Founder','CEO','Owner','President','Managing Partner',
  'Director of Marketing','CMO','VP of Operations','Co-Founder','Executive Director',
];
const CITY_POOL = ['Houston','Katy','Sugar Land','Pearland','Cypress','The Woodlands'];
const EMP_POOL = ['1-10','11-50','51-200','201-500'];

for (let i = 28; i <= 120; i++) {
  CONTACTS.push({
    id: i,
    first: 'Contact',
    last: `${i}`,
    title: TITLE_POOL[i % TITLE_POOL.length],
    company: `Houston Company ${i}`,
    website: '—',
    linkedin: '—',
    email: `contact${i}@company${i}.com`,
    phone: '—',
    city: CITY_POOL[i % CITY_POOL.length],
    ind: IND_POOL[i % IND_POOL.length],
    employees: EMP_POOL[i % EMP_POOL.length],
    signals: SIG_POOL[i % SIG_POOL.length],
    score: 40 + (i % 45),
  });
}
