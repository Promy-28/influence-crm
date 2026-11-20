export const farmCommunities=[
 {name:'Ugc_forhire',group:'owner',note:'Из твоего проверенного списка. Перед отправкой проверь актуальные правила и flair.'},
 {name:'UGCs',group:'owner',note:'Из твоего проверенного списка. Подбирай текст под формат сообщества.'},
 {name:'UGCSideHustle',group:'owner',note:'Из твоего проверенного списка. Условия и ограничения — в правилах сообщества.'},
 {name:'techugc',group:'owner',note:'Из твоего проверенного списка. Для технических UGC-тем.'},
 {name:'BrandsCreators',group:'candidate',note:'Кандидат для обсуждений об UGC. Правила запрещают рекламу и избыточное продвижение; коммерческий пост сначала согласуй с модератором.',evidence:'https://www.reddit.com/r/BrandsCreators/'},
 {name:'UGCconnect',group:'candidate',note:'Для рекрутинга в Promy как платформу нужно предварительное разрешение модератора. Для вакансии бренда: Paid gig, ставка, объём и страны. Без согласования платформы не отправляй.',evidence:'https://www.reddit.com/r/UGCconnect/'},
];
export const accountLabels:Record<string,string>={warming:'Прогревается',ready:'Готов',live:'Активен',needs_human:'Нужен человек',new:'Новый',registering:'Регистрация',paused:'На паузе',flagged:'Ограничение',banned:'Заблокирован',retired:'Выведен из работы'};
export const canPost=(a:{platform:string;status:string})=>a.platform==='reddit'&&['warming','ready','live'].includes(a.status);
