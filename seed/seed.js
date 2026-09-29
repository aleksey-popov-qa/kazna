const W=[];const S=(c,id,d)=>W.push({op:'set',collection:c,doc_id:id,data:d});
S('accounts','a-bank',{name:'Расчётный счёт',type:'bank',opening:0,order:0});
S('accounts','a-cash',{name:'Касса',type:'cash',opening:0,order:1});
const ST=[['c01','Выручка от продаж','in','op',true],['c02','Прочие поступления','in','op',true],['c03','Закупка и себестоимость','out','op',true],['c04','Зарплата','out','op',true],['c05','Аренда','out','op',true],['c06','Маркетинг и реклама','out','op',true],['c07','Налоги и взносы','out','op',true],['c08','Банковские комиссии','out','op',true],['c09','Связь и сервисы','out','op',true],['c10','Прочие расходы','out','op',true],['c11','Продажа имущества','in','inv',false],['c12','Покупка оборудования','out','inv',false],['c13','Получение кредита','in','fin',false],['c14','Погашение кредита','out','fin',false],['c15','Проценты по кредитам','out','fin',true],['c16','Вложения собственника','in','fin',false],['c17','Вывод собственнику','out','fin',false]];
for(const [id,name,kind,flow,pnl] of ST) S('categories',id,{name,kind,flow,pnl});
S('projects','d-prj1',{name:'Кофейня на Садовой',demo:true});
S('projects','d-prj2',{name:'Доставка',demo:true});
const P={rent:'ООО «Бизнес-центр Север»',bean:'ООО «Зерно и Ко»',ads:'ООО «Реклама Плюс»',fns:'ФНС',bank:'Банк «Кредит-Партнёр»'};
for(const k in P) S('parties','d-'+k,{name:P[k],demo:true});
const today='2026-09-29';let n=0;const ops=[];
const O=(date,kind,amount,account,cat,o={})=>{ops.push({date,kind,amount,account,...(cat?{category:cat}:{}),status:date>today?'plan':'fact',demo:true,created:1780000000000+(n++),...o});};
O('2026-07-01','in',400000,'a-bank','c16',{note:'Стартовый капитал'});
const months=['2026-07','2026-08','2026-09','2026-10','2026-11'];
months.forEach((m,i)=>{
 const up=1+i*0.06;
 for(const d of ['07','14','21','28']){O(`${m}-${d}`,'in',Math.round(64000*up/100)*100,'a-bank','c01',{project:'d-prj1',note:'Эквайринг за неделю'});}
 O(`${m}-15`,'in',Math.round(38000*up/100)*100,'a-cash','c01',{project:'d-prj1',note:'Наличная выручка'});
 O(`${m}-18`,'in',Math.round(64000*up/100)*100,'a-bank','c01',{project:'d-prj2',note:'Заказы доставки'});
 O(`${m}-${i==4?'26':'27'}`,'in',Math.round(61000*up/100)*100,'a-bank','c01',{project:'d-prj2',note:'Заказы доставки'});
 O(`${m}-16`,'move',30000,'a-cash',null,{to:'a-bank',note:'Инкассация'});
 O(`${m}-05`,'out',95000,'a-bank','c05',{project:'d-prj1',party:'d-rent',note:'Аренда помещения'});
 O(`${m}-10`,'out',110000,'a-bank','c04',{note:'Зарплата, вторая часть'});
 O(`${m}-25`,'out',95000,'a-bank','c04',{note:'Аванс'});
 O(`${m}-03`,'out',48000,'a-bank','c03',{project:'d-prj1',party:'d-bean',note:'Кофе и молоко'});
 O(`${m}-17`,'out',41000,'a-bank','c03',{project:'d-prj1',party:'d-bean',note:'Кофе и молоко'});
 O(`${m}-12`,'out',i<3?22000:30000,'a-bank','c06',{project:'d-prj2',party:'d-ads',note:'Таргетированная реклама'});
 O(`${m}-28`,'out',36000,'a-bank','c07',{party:'d-fns',note:'Страховые взносы'});
 if(i<3) O(`${m}-30`,'out',1450,'a-bank','c08',{note:'Обслуживание счёта'});
});
O('2026-08-01','in',300000,'a-bank','c13',{party:'d-bank',note:'Кредит на оборудование'});
O('2026-08-12','out',260000,'a-bank','c12',{project:'d-prj2',note:'Электровелосипеды для курьеров'});
for(const m of ['2026-09','2026-10','2026-11']){O(`${m}-20`,'out',26000,'a-bank','c14',{party:'d-bank',note:'Погашение тела кредита'});O(`${m}-20`,'out',4200,'a-bank','c15',{party:'d-bank',note:'Проценты'});}
O('2026-09-26','out',6900,'a-bank','c09',{status:'plan',note:'Касса и учётная система, год'});
O('2026-11-09','out',95000,'a-bank','c12',{project:'d-prj1',note:'Вторая кофемашина'});
O('2026-11-06','out',180000,'a-bank','c07',{note:'УСН за 9 месяцев'});
ops.forEach((o,i)=>S('ops','d-o'+String(i+1).padStart(3,'0'),o));
// check balances
const ev=ops.map(o=>[o.date,o.kind==='move'?0:(o.kind==='in'?o.amount:-o.amount),o.status]).sort();
let b=0,min=1e12,md='';for(const [d,v] of ev){b+=v;if(b<min){min=b;md=d}}
let bf=0;for(const [d,v,s] of ev){if(s==='fact')bf+=v}
console.error('ops',ops.length,'total docs',W.length,'fact bal',bf,'min',min,md,'end',b);
const fs=require('fs');for(let i=0;i<W.length;i+=50)fs.writeFileSync(`batch${i/50}.json`,JSON.stringify(W.slice(i,i+50)));
