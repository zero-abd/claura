// Languages, spoken labels and a verified phrase table.
//
// The War Room brief (apps/dashboard/src/warroom-data.ts) is English. For stakeholders who do not read English,
// every string the console ships is pre-translated here (es, fr, hi, zh) so the multilingual brief is
// deterministic and needs no model. Anything NOT in the table (a changed or live brief) is translated by the
// local Nemotron model at request time (see brief.mjs) and flagged as machine translation.

export const LANGS = {
  en: { name: 'English', native: 'English', code3: 'eng', speech: 'en-US' },
  es: { name: 'Spanish', native: 'Español', code3: 'spa', speech: 'es-ES' },
  hi: { name: 'Hindi', native: 'हिन्दी', code3: 'hin', speech: 'hi-IN' },
  zh: { name: 'Chinese (Simplified)', native: '中文', code3: 'zho', speech: 'zh-CN' },
  fr: { name: 'French', native: 'Français', code3: 'fra', speech: 'fr-FR' },
};
export const LANG_CODES = Object.keys(LANGS);

/** ISO 639-3 (what ElevenLabs Scribe returns) or a BCP-47 tag -> one of our 2-letter codes. */
export function normLang(input, fallback = 'en') {
  if (!input) return fallback;
  const s = String(input).toLowerCase().trim();
  if (LANGS[s]) return s;
  const two = s.split(/[-_]/)[0];
  if (LANGS[two]) return two;
  for (const [k, v] of Object.entries(LANGS)) if (v.code3 === s || v.code3 === two) return k;
  if (s === 'cmn' || s === 'yue' || s === 'zh-cn' || s === 'zh-hans') return 'zh';
  return fallback;
}

// Spoken section headings for the brief.
export const LABELS = {
  en: { intro: 'Claura brief for stakeholders.', happened: 'What happened.', contained: 'What is contained.', impact: 'Impact.', need: 'What we need from you.', know: 'What we know.', dont: "What we don't know yet." },
  es: { intro: 'Informe de Claura para las partes interesadas.', happened: 'Qué ocurrió.', contained: 'Qué está contenido.', impact: 'Impacto.', need: 'Qué necesitamos de ustedes.', know: 'Lo que sabemos.', dont: 'Lo que aún no sabemos.' },
  fr: { intro: 'Point de situation Claura pour les parties prenantes.', happened: "Ce qui s'est passé.", contained: 'Ce qui est contenu.', impact: 'Impact.', need: 'Ce que nous attendons de vous.', know: 'Ce que nous savons.', dont: 'Ce que nous ne savons pas encore.' },
  hi: { intro: 'हितधारकों के लिए Claura ब्रीफ़।', happened: 'क्या हुआ।', contained: 'क्या नियंत्रित है।', impact: 'प्रभाव।', need: 'हमें आपसे क्या चाहिए।', know: 'हम क्या जानते हैं।', dont: 'हम अभी क्या नहीं जानते।' },
  zh: { intro: 'Claura 利益相关方简报。', happened: '发生了什么。', contained: '已控制的内容。', impact: '影响。', need: '需要您做的事。', know: '我们已知的情况。', dont: '我们尚不清楚的情况。' },
};

// [en, es, fr, hi, zh]. One row per distinct English string in the War Room briefs (all six stages).
const ROWS = [
  // quiet
  ['Nothing to report. All systems are normal.', 'Nada que informar. Todos los sistemas funcionan con normalidad.', 'Rien à signaler. Tous les systèmes fonctionnent normalement.', 'बताने के लिए कुछ नहीं है। सभी सिस्टम सामान्य रूप से चल रहे हैं।', '没有需要报告的情况。所有系统运行正常。'],
  ['Nothing to contain.', 'No hay nada que contener.', 'Rien à contenir.', 'रोकने के लिए कुछ नहीं है।', '没有需要遏制的情况。'],
  ['No customers affected.', 'Ningún cliente afectado.', 'Aucun client touché.', 'किसी ग्राहक पर असर नहीं पड़ा है।', '没有客户受到影响。'],
  ['Nothing. Keep your break-glass sign-in somewhere safe.', 'Nada. Guarde su acceso de emergencia en un lugar seguro.', "Rien. Gardez votre accès d'urgence en lieu sûr.", 'कुछ नहीं। अपना ब्रेक-ग्लास साइन-इन किसी सुरक्षित जगह रखें।', '无需操作。请妥善保管您的应急登录凭据。'],
  ['All 6 stakeholder identities are verified', 'Las 6 identidades de las partes interesadas están verificadas', 'Les 6 identités des parties prenantes sont vérifiées', 'सभी 6 हितधारकों की पहचान सत्यापित है', '6 位相关方的身份均已验证'],
  ['This channel runs outside the company network', 'Este canal funciona fuera de la red de la empresa', "Ce canal fonctionne en dehors du réseau de l'entreprise", 'यह चैनल कंपनी के नेटवर्क के बाहर चलता है', '此频道运行在公司网络之外'],
  ['The last incident closed 6 days ago', 'El último incidente se cerró hace 6 días', 'Le dernier incident a été clos il y a 6 jours', 'पिछली घटना 6 दिन पहले बंद हुई थी', '上一起事件已于 6 天前关闭'],
  ['Nothing is open right now', 'No hay nada abierto en este momento', "Rien n'est ouvert pour le moment", 'इस समय कुछ भी खुला नहीं है', '目前没有未结事项'],

  // detect
  ['An AI workload inside a virtual machine tried to break out and reach the server underneath it.', 'Una carga de trabajo de IA dentro de una máquina virtual intentó escapar y llegar al servidor que la aloja.', "Une charge de travail d'IA, à l'intérieur d'une machine virtuelle, a tenté de s'échapper et d'atteindre le serveur sous-jacent.", 'एक वर्चुअल मशीन के अंदर चल रहे AI वर्कलोड ने बाहर निकलकर उसके नीचे मौजूद सर्वर तक पहुँचने की कोशिश की।', '虚拟机内的一个 AI 工作负载试图突破隔离，访问其底层的服务器。'],
  ['Not yet. Our detection agent caught it within a second and is checking how far it got.', 'Todavía no. Nuestro agente de detección lo captó en menos de un segundo y está comprobando hasta dónde llegó.', "Pas encore. Notre agent de détection l'a repéré en moins d'une seconde et vérifie jusqu'où cela est allé.", 'अभी नहीं। हमारे डिटेक्शन एजेंट ने इसे एक सेकंड के भीतर पकड़ लिया और अब जाँच रहा है कि यह कितनी दूर तक पहुँचा।', '还没有。我们的检测代理在一秒内发现了它，正在查明它走到了哪一步。'],
  ['Not known yet. One server out of 2,048 is involved.', 'Aún no se sabe. Hay un servidor involucrado de un total de 2.048.', 'Pas encore connu. Un serveur sur 2 048 est concerné.', 'अभी पता नहीं है। 2,048 में से एक सर्वर इसमें शामिल है।', '目前还不清楚。涉及 2,048 台服务器中的 1 台。'],
  ['Nothing yet. Please stay in this channel.', 'Por ahora nada. Por favor, permanezcan en este canal.', "Rien pour l'instant. Merci de rester dans ce canal.", 'अभी कुछ नहीं। कृपया इसी चैनल में बने रहें।', '暂时无需操作。请留在此频道。'],
  ['It started on one server, b14-gpu-07', 'Empezó en un solo servidor, b14-gpu-07', 'Cela a commencé sur un seul serveur, b14-gpu-07', 'यह एक ही सर्वर, b14-gpu-07, पर शुरू हुआ', '事件始于一台服务器：b14-gpu-07'],
  ['It was detected within 1 second', 'Se detectó en menos de 1 segundo', "Il a été détecté en moins d'une seconde", 'इसे 1 सेकंड के भीतर पकड़ लिया गया', '在 1 秒内被检测到'],
  ['Our own tools are working', 'Nuestras propias herramientas funcionan', 'Nos propres outils fonctionnent', 'हमारे अपने टूल ठीक से काम कर रहे हैं', '我们自己的工具运行正常'],
  ['Whether any data was read', 'Si se leyó algún dato', 'Si des données ont été lues', 'क्या कोई डेटा पढ़ा गया', '是否有数据被读取'],
  ['How far the attacker got', 'Hasta dónde llegó el atacante', "Jusqu'où l'attaquant est allé", 'हमलावर कितनी दूर तक पहुँचा', '攻击者走到了哪一步'],

  // contain
  ['Its network and passwords are cut off, the server is fenced off, and the workload is paused.', 'Se cortaron su red y sus contraseñas, el servidor quedó aislado y la carga de trabajo está en pausa.', 'Son réseau et ses mots de passe sont coupés, le serveur est isolé et la charge de travail est en pause.', 'उसका नेटवर्क और पासवर्ड काट दिए गए हैं, सर्वर को अलग कर दिया गया है और वर्कलोड रोक दिया गया है।', '它的网络和密码已被切断，服务器已被隔离，工作负载已暂停。'],
  ['No customer data accessed so far. 11 other workloads are moving to safe servers.', 'Hasta ahora no se ha accedido a datos de clientes. 11 cargas de trabajo más se están trasladando a servidores seguros.', "Aucune donnée client consultée jusqu'ici. 11 autres charges de travail basculent vers des serveurs sûrs.", 'अब तक किसी ग्राहक डेटा तक पहुँच नहीं हुई है। 11 अन्य वर्कलोड सुरक्षित सर्वरों पर जा रहे हैं।', '目前没有客户数据被访问。另外 11 个工作负载正在迁往安全的服务器。'],
  ['Legal: start a notification assessment. PR: have a holding statement ready.', 'Legal: inicien una evaluación de notificación. Comunicación: tengan lista una declaración provisional.', "Juridique : lancez une évaluation des obligations de notification. Communication : préparez une déclaration d'attente.", 'लीगल: अधिसूचना का आकलन शुरू करें। पीआर: एक प्रारंभिक बयान तैयार रखें।', '法务：请开始评估通报义务。公关：请准备好一份临时声明。'],
  ['It was stopped before the management network', 'Se detuvo antes de llegar a la red de gestión', "Il a été arrêté avant d'atteindre le réseau de gestion", 'इसे मैनेजमेंट नेटवर्क तक पहुँचने से पहले ही रोक दिया गया', '在抵达管理网络之前就被拦住了'],
  ['2 exposed passwords are revoked', 'Las 2 contraseñas expuestas fueron revocadas', 'Les 2 mots de passe exposés ont été révoqués', 'उजागर हुए 2 पासवर्ड रद्द कर दिए गए हैं', '已吊销 2 个暴露的密码'],
  ['Whether any data was read first', 'Si se leyó algún dato antes', 'Si des données ont été lues auparavant', 'क्या पहले कोई डेटा पढ़ा गया था', '此前是否有数据被读取'],
  ['How the attacker found the flaw', 'Cómo encontró el atacante la vulnerabilidad', "Comment l'attaquant a trouvé la faille", 'हमलावर को यह कमज़ोरी कैसे मिली', '攻击者是如何发现这个漏洞的'],

  // approval
  ['Everything that can be undone is done. One step is left and needs a person.', 'Todo lo que se puede deshacer ya está hecho. Queda un paso, y requiere a una persona.', 'Tout ce qui est réversible est fait. Il reste une étape, qui demande une personne.', 'जो कुछ भी वापस पलटा जा सकता है, वह हो चुका है। एक कदम बाकी है, जिसके लिए इंसान की ज़रूरत है।', '所有可以撤销的操作都已完成。还剩一步，需要有人来决定。'],
  ['No customer data accessed so far. Other workloads are running normally.', 'Hasta ahora no se ha accedido a datos de clientes. Las demás cargas de trabajo funcionan con normalidad.', "Aucune donnée client consultée jusqu'ici. Les autres charges de travail fonctionnent normalement.", 'अब तक किसी ग्राहक डेटा तक पहुँच नहीं हुई है। बाकी वर्कलोड सामान्य रूप से चल रहे हैं।', '目前没有客户数据被访问。其他工作负载运行正常。'],
  ['Incident Commander: approve taking the server out of service.', 'Comandante del incidente: apruebe sacar el servidor de servicio.', "Commandant d'incident : approuvez la mise hors service du serveur.", 'इंसिडेंट कमांडर: सर्वर को सेवा से बाहर करने की मंज़ूरी दें।', '事件指挥官：请批准让该服务器下线。'],
  ['11 other workloads moved to safe servers', '11 cargas de trabajo más se trasladaron a servidores seguros', '11 autres charges de travail ont basculé vers des serveurs sûrs', '11 अन्य वर्कलोड सुरक्षित सर्वरों पर भेज दिए गए', '另外 11 个工作负载已迁至安全的服务器'],

  // quarantine
  ['The Incident Commander approved. The server is being taken out of service now.', 'El comandante del incidente aprobó. El servidor se está sacando de servicio ahora.', "Le commandant d'incident a approuvé. Le serveur est en cours de mise hors service.", 'इंसिडेंट कमांडर ने मंज़ूरी दे दी है। सर्वर को अभी सेवा से बाहर किया जा रहा है।', '事件指挥官已批准。服务器正在下线。'],
  ['Nothing right now. This will take a couple of seconds.', 'Nada por ahora. Esto tardará un par de segundos.', 'Rien pour le moment. Cela prendra quelques secondes.', 'अभी कुछ नहीं। इसमें कुछ ही सेकंड लगेंगे।', '目前无需操作。这只需要几秒钟。'],
  ['Approved by RK at T+7.4 s', 'Aprobado por RK a los 7,4 segundos', 'Approuvé par RK à 7,4 secondes', 'RK ने 7.4 सेकंड पर मंज़ूरी दी', 'RK 在 7.4 秒时批准'],

  // contained
  ['A suspected escape from an AI workload was stopped at the edge of its virtual machine.', 'Una sospecha de fuga desde una carga de trabajo de IA fue detenida en el límite de su máquina virtual.', "Une évasion présumée d'une charge de travail d'IA a été stoppée à la limite de sa machine virtuelle.", 'एक AI वर्कलोड से संदिग्ध बच निकलने की कोशिश को उसकी वर्चुअल मशीन की सीमा पर ही रोक दिया गया।', '一个 AI 工作负载疑似逃逸的企图，在其虚拟机的边界处被阻止了。'],
  ['Contained in 9.4 seconds. The server is out of service and its workloads run elsewhere.', 'Contenido en 9,4 segundos. El servidor está fuera de servicio y sus cargas de trabajo se ejecutan en otros servidores.', 'Contenu en 9,4 secondes. Le serveur est hors service et ses charges de travail tournent ailleurs.', '9.4 सेकंड में नियंत्रित कर लिया गया। सर्वर सेवा से बाहर है और उसके वर्कलोड कहीं और चल रहे हैं।', '9.4 秒内已控制住。服务器已下线，其工作负载已在其他服务器上运行。'],
  ['0 other workloads affected. No sign that customer data was accessed.', '0 cargas de trabajo adicionales afectadas. No hay indicios de que se haya accedido a datos de clientes.', "0 autre charge de travail touchée. Aucun signe d'accès aux données clients.", 'किसी अन्य वर्कलोड पर असर नहीं पड़ा। इस बात का कोई संकेत नहीं कि ग्राहक डेटा तक पहुँच हुई।', '没有其他工作负载受到影响。没有迹象表明客户数据被访问。'],
  ['Legal: decide on notification. Vendor: confirm the hypervisor patch.', 'Legal: decidan sobre la notificación. Proveedor: confirme el parche del hipervisor.', "Juridique : décidez de la notification. Fournisseur : confirmez le correctif de l'hyperviseur.", 'लीगल: अधिसूचना पर निर्णय लें। वेंडर: हाइपरवाइज़र पैच की पुष्टि करें।', '法务：请决定是否通报。供应商：请确认虚拟机管理程序补丁。'],
  ['Stopped at the hypervisor boundary', 'Detenido en el límite del hipervisor', "Stoppé à la limite de l'hyperviseur", 'हाइपरवाइज़र की सीमा पर ही रोक दिया गया', '在虚拟机管理程序的边界处被阻止'],
  ['Evidence is captured and hashed', 'La evidencia está capturada y con su huella hash', 'Les preuves sont capturées et hachées', 'सबूत सुरक्षित कर लिए गए हैं और उनका हैश बना लिया गया है', '证据已被采集并计算了哈希值'],
  ['Whether any data was read before containment', 'Si se leyó algún dato antes de la contención', 'Si des données ont été lues avant le confinement', 'क्या नियंत्रण से पहले कोई डेटा पढ़ा गया', '在控制住之前是否有数据被读取'],
  ['The root cause. The vendor is checking', 'La causa raíz. El proveedor lo está revisando', 'La cause racine. Le fournisseur vérifie', 'मूल कारण। वेंडर इसकी जाँच कर रहा है', '根本原因。供应商正在核查'],
];

const LANG_ORDER = ['es', 'fr', 'hi', 'zh'];
const key = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const TABLE = new Map();
for (const row of ROWS) {
  const en = row[0];
  const tr = {};
  LANG_ORDER.forEach((l, i) => (tr[l] = row[i + 1]));
  TABLE.set(key(en), tr);
}

/** Verified translation of a known console string, or null. English returns the input. */
export function lookupPhrase(text, lang) {
  if (lang === 'en') return text;
  const hit = TABLE.get(key(text));
  return hit ? hit[lang] ?? null : null;
}
export const PHRASE_COUNT = TABLE.size;

// Short spoken replies used by guards and the rules fallback.
export const MISC = {
  unknown: {
    en: "I don't have that information yet.",
    es: 'Todavía no tengo esa información.',
    fr: "Je n'ai pas encore cette information.",
    hi: 'अभी मेरे पास यह जानकारी नहीं है।',
    zh: '我目前还没有这方面的信息。',
  },
  readOnly: {
    en: "I can't do that by voice. I'm read-only: actions go through the policy gate, and the high-impact ones need a person on the approval card.",
    es: 'No puedo hacer eso por voz. Solo puedo consultar: las acciones pasan por la puerta de políticas y las de alto impacto requieren a una persona en la tarjeta de aprobación.',
    fr: "Je ne peux pas faire cela par la voix. Je suis en lecture seule : les actions passent par la barrière de politique, et celles à fort impact demandent une personne sur la carte d'approbation.",
    hi: 'यह आवाज़ से नहीं किया जा सकता। यहाँ से केवल जानकारी देखी जा सकती है; कार्रवाइयाँ नीति द्वार से गुज़रती हैं, और ज़्यादा असर वाली कार्रवाइयों के लिए अनुमोदन कार्ड पर किसी इंसान की मंज़ूरी ज़रूरी है।',
    zh: '我无法通过语音执行这个操作。我只有只读权限：所有操作都要经过策略关卡，影响重大的操作需要有人在审批卡上批准。',
  },
  noSpeech: {
    en: "I didn't catch that. Please try again.",
    es: 'No lo he entendido. Inténtelo de nuevo.',
    fr: "Je n'ai pas compris. Veuillez réessayer.",
    hi: 'यह सुनाई नहीं दिया। कृपया दोबारा बोलें।',
    zh: '我没听清，请再说一遍。',
  },
  notifications: {
    en: 'Counsel decides whether and when to notify, and the notification clocks have not started.',
    es: 'El área legal decide si se notifica y cuándo, y los plazos de notificación aún no han comenzado.',
    fr: "Le service juridique décide si et quand notifier, et les délais de notification n'ont pas commencé.",
    hi: 'अधिसूचना देनी है या नहीं और कब, यह कानूनी सलाहकार तय करेंगे; अधिसूचना की समय-सीमाएँ अभी शुरू नहीं हुई हैं।',
    zh: '是否通报以及何时通报由法务决定，通报的时限尚未开始计算。',
  },
  detection: {
    en: 'It was detected in under one second.',
    es: 'Se detectó en menos de un segundo.',
    fr: 'Il a été détecté en moins d\'une seconde.',
    hi: 'इसे एक सेकंड से भी कम समय में पकड़ लिया गया।',
    zh: '在不到一秒内就被检测到了。',
  },
  nothingPending: {
    en: 'Nothing is waiting for approval right now.',
    es: 'No hay nada pendiente de aprobación en este momento.',
    fr: "Rien n'est en attente d'approbation pour le moment.",
    hi: 'इस समय अनुमोदन के लिए कुछ भी लंबित नहीं है।',
    zh: '目前没有等待审批的事项。',
  },
};
export const miscFor = (name, lang) => MISC[name]?.[lang] ?? MISC[name]?.en ?? '';
