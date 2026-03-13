export type Language = "en" | "ru";

export interface HeroStat {
  label: string;
  value: string;
  detail: string;
}

export interface TimelineEntry {
  period: string;
  title: string;
  subtitle?: string;
  description?: string;
  details?: string[];
  tags?: string[];
}

export interface SkillEntry {
  category: string;
  detail: string;
  items?: string[];
  tools?: string[];
}

export interface ContactEntry {
  label: string;
  href: string;
  text: string;
}

export interface ActionEntry {
  label: string;
  href: string;
  external?: boolean;
}

export const cvContent = {
  en: {
    hero: {
      name: "Aleksandr Odnakov",
      subtitle: "Data Analyst · Moscow",
      intro:
        "Analytics, risk modeling, education projects, and Olympiad-grade mathematics. This page combines the strongest details across multiple CV versions instead of flattening everything into one page.",
      stats: [
        {
          label: "Current",
          value: "T-Bank",
          detail: "Risk analyst building LTV logic for medium-enterprise acquisition.",
        },
        {
          label: "Before that",
          value: "Yandex",
          detail: "From antifraud internship to product and deal analytics in commerce.",
        },
        {
          label: "Education",
          value: "Skoltech + ICEF",
          detail: "MSc in Data Science after ICEF at HSE & LSE track.",
        },
        {
          label: "Olympiads",
          value: "Math + Econ",
          detail: "Prize winner at the final stages and listed competitions.",
        },
      ] satisfies HeroStat[],
    },
    sections: {
      experience: "Experience",
      community: "Projects & Community",
      education: "Education",
      achievements: "Achievements",
      skills: "Skills",
      contact: "Contact",
    },
    ui: {
      expand: "Open details",
      collapse: "Hide details",
    },
    experienceItems: [
      {
        period: "06.2025 — present",
        title: "Risk Analyst",
        subtitle: "T-Bank",
        description:
          "Building the T-Business LTV model for medium-enterprise clients and supporting acquisition decisions.",
        details: [
          "Developed an LTV model for assessing medium-enterprise clients in T-Business.",
          "Worked at the intersection of risk and acquisition, turning analytical work into an operational scoring layer.",
          "Extended previous product analytics experience into credit and portfolio-quality logic.",
        ],
        tags: ["Risk", "LTV", "Acquisition", "Medium Enterprise"],
      },
      {
        period: "05.2021 — 04.2025",
        title: "Analyst / Middle Analyst",
        subtitle: "Yandex",
        description:
          "Owned analytics for bonuses, performance deals, payout audits, and credit-line automation.",
        details: [
          "Started with an antifraud internship and improved fraud detection efficiency.",
          "Led analytics for the Bonuses in Direct product, including effectiveness and profitability.",
          "Built and supported dashboards for performance deals with major counterparties.",
          "Audited bonus payouts, found critical issues, and introduced checks that saved money.",
          "Used forecasting, including Prophet-based turnover estimates, to assess deal completion.",
          "Worked on automation and transparency improvements for agency credit-line issuance.",
        ],
        tags: ["Yandex Direct", "Forecasting", "Dashboards", "Audit", "Automation"],
      },
      {
        period: "2018 — 2020",
        title: "Mathematics Teacher",
        subtitle: "Ulyanovsk Winter/Summer Schools · Sirius",
        description:
          "Taught intensive mathematics programs for school students across several seasonal schools.",
        details: [
          "Ran three two-hour classes per day for grades 6-11 depending on program and year.",
          "Taught at winter and summer math schools across multiple years.",
          "Also taught October math sessions at the Sirius Educational Center.",
        ],
        tags: ["Teaching", "Mathematics", "Sirius", "Olympiad training"],
      },
    ] satisfies TimelineEntry[],
    communityItems: [
      {
        period: "01.2019 — 10.2019",
        title: "Programmer-Developer",
        subtitle: "Economic Carousel",
        description:
          "Designed and maintained the Telegram bot that automated the competition workflow.",
        details: [
          "Built the core bot structure, UX, debugging flow, and hosting setup.",
          "Handled JSON / NoSQL-style storage patterns, Telegram API primitives, async jobs, and inline interactions.",
          "Hosted the system on VPS environments including DigitalOcean and Heroku.",
          "Supported more than 200 unique participants across editions.",
        ],
        tags: ["Python", "Telegram API", "UX", "Hosting"],
      },
      {
        period: "03.2019",
        title: "Organizer / Volunteer",
        subtitle: "Final Stage of the Russian Olympiad in Economics",
        description:
          "Worked in the organization committee and helped prepare and run Olympiad tours.",
        details: [
          "Prepared logistics and operational support for the final-stage event.",
          "Combined organizational work with the perspective of a former Olympiad participant.",
        ],
        tags: ["Operations", "Education", "Olympiad"],
      },
      {
        period: "12.2018",
        title: "Compendium of Economic Tests",
        subtitle: "Editorial and technical preparation",
        description:
          "Sorted and grouped 400+ tasks and prepared materials in LaTeX for Olympiad preparation.",
        details: [
          "Structured a large archive of test questions into a usable preparation format.",
          "The resulting compendium was used by thousands of students.",
        ],
        tags: ["LaTeX", "Content systems", "Economics"],
      },
    ] satisfies TimelineEntry[],
    educationItems: [
      {
        period: "2022 — 2024",
        title: "Skoltech",
        subtitle: "MSc in Data Science",
        description:
          "Grade A diploma with a LiDAR semantic-segmentation thesis.",
        details: [
          'Thesis: "Improving LiDAR Point Cloud Semantic Segmentation Using Global Maps".',
          "Formalized ML-heavy work on 3D data beyond classic business analytics.",
          "Turned the CV from a pure analytics story into a strong applied data-science profile.",
        ],
        tags: ["Machine Learning", "LiDAR", "3D", "Skoltech"],
      },
      {
        period: "2018 — 2022",
        title: "NRU HSE & LSE Track",
        subtitle: "International College of Economics and Finance",
        description:
          "Finished in the top cohort after ranking as high as top 3 during the program.",
        details: [
          "Final GPA 9.12/10 and top 20 overall out of 250+ students.",
          "Earlier CV versions mention top 12, top 7, and top 3 positions in interim ratings.",
          "Academic focus included Calculus++, Economic Thinking, and Advanced Statistics.",
          "The program ran under the University of London / LSE academic direction.",
        ],
        tags: ["ICEF", "Economics", "Statistics", "HSE", "LSE"],
      },
    ] satisfies TimelineEntry[],
    achievementItems: [
      {
        period: "2021",
        title: "Prize winner, Higher League Olympiad",
        description: "Recognized in game theory and applied mathematics.",
        details: [
          "One of the academic markers showing strong math performance beyond school Olympiads.",
        ],
        tags: ["Game Theory", "Applied Mathematics"],
      },
      {
        period: "2021",
        title: "Winner, HSE Student Research Paper Competition",
        description: "Awarded in the finance papers competition.",
        details: [
          "Evidence of formal writing and research communication in addition to technical skills.",
        ],
        tags: ["Research", "Finance"],
      },
      {
        period: "2015 — 2018",
        title: "Olympiad track record",
        description:
          "Two-time math prize winner, economics prize winner, and repeated listed-olympiad finalist.",
        details: [
          "Two-time prize winner of the final stage of the Russian Olympiad in Mathematics.",
          "Prize winner of the final stage in Economics.",
          "Winner and prize winner of listed Olympiads including Higher Probe, Vorobyovy Gory, Phystech, and Tournament of Towns.",
        ],
        tags: ["Mathematics", "Economics", "Olympiads"],
      },
    ] satisfies TimelineEntry[],
    skills: [
      {
        category: "Python",
        detail: "Production scripting, bot logic, automation, and analytical tooling.",
        items: [
          "Course grades 10/10 in Programming and Data Processing and Data Science-related courses.",
          "Worked with pandas, numpy, scipy, OpenPyXL, JSON, and Telegram bot APIs.",
          "Built async bots, callback flows, job queues, and hosted services on VPS platforms.",
        ],
        tools: ["pandas", "numpy", "scipy", "OpenPyXL", "Telegram API"],
      },
      {
        category: "SQL and analytics stack",
        detail: "Querying, product analytics, payout checks, and dashboarding.",
        items: [
          "Used SQL extensively for analytical development and reporting.",
          "Older CV versions mention R, YQL flavor, and even Starlark in the wider toolkit.",
          "Experience spans dashboards, forecasting, profitability checks, and audit tasks.",
        ],
        tools: ["SQL", "YQL", "R", "Prophet", "Dashboards"],
      },
      {
        category: "Systems",
        detail: "Linux-first workflow with hosting and automation experience.",
        items: [
          "Linux experience is described across CV versions as 3+ to 9+ years, depending on date.",
          "Comfortable with Bash, SSH, Docker, and practical deployment work.",
          "Hosted projects on DigitalOcean, Heroku, and other VPS environments.",
        ],
        tools: ["Linux", "Bash", "SSH", "Docker", "VPS"],
      },
      {
        category: "Languages",
        detail: "Russian native, English advanced.",
        items: [
          "TOEFL 98 appears consistently across versions.",
          "IELTS improved from 7.5 to 8 in later versions.",
        ],
        tools: ["Russian", "English", "TOEFL 98", "IELTS 8"],
      },
      {
        category: "Other",
        detail: "The long tail that makes analytical work actually move.",
        items: [
          "LaTeX for structured educational and research materials.",
          "MS Office and EViews in classical economics / analytics workflows.",
        ],
        tools: ["LaTeX", "MS Office", "EViews"],
      },
    ] satisfies SkillEntry[],
    contacts: [
      {
        label: "Email",
        href: "mailto:aleksandr.odnakov010@gmail.com",
        text: "aleksandr.odnakov010@gmail.com",
      },
      { label: "Phone", href: "tel:+79876322671", text: "+7 987 632 26 71" },
      { label: "GitHub", href: "https://github.com/ooodnakov", text: "github.com/ooodnakov" },
    ] satisfies ContactEntry[],
    actions: [
      { label: "PDF (EN)", href: "/cv-pdf/en" },
      { label: "PDF (RU)", href: "/cv-pdf/ru" },
      { label: "Legacy / Archive", href: "/legacy/" },
    ] satisfies ActionEntry[],
    footer: "Moscow · 2025",
    toggleThemeLabel: "Toggle theme",
  },
  ru: {
    hero: {
      name: "Александр Однаков",
      subtitle: "Аналитик данных · Москва",
      intro:
        "Аналитика, риск-модели, образовательные проекты и олимпиадная математика. Эта страница собирает сильные детали из разных версий CV и показывает их как живую историю, а не как плоский лист.",
      stats: [
        {
          label: "Сейчас",
          value: "Т-Банк",
          detail: "Risk Analyst, LTV-модель для привлечения клиентов ME сегмента.",
        },
        {
          label: "До этого",
          value: "Яндекс",
          detail: "От антифрода до продуктовой и коммерческой аналитики.",
        },
        {
          label: "Образование",
          value: "Сколтех + ICEF",
          detail: "MSc по Data Science после ICEF в ВШЭ и LSE-трека.",
        },
        {
          label: "Олимпиады",
          value: "Математика + экономика",
          detail: "Призер финалов и перечневых олимпиад.",
        },
      ] satisfies HeroStat[],
    },
    sections: {
      experience: "Опыт",
      community: "Проекты и комьюнити",
      education: "Образование",
      achievements: "Достижения",
      skills: "Навыки",
      contact: "Контакты",
    },
    ui: {
      expand: "Открыть детали",
      collapse: "Скрыть детали",
    },
    experienceItems: [
      {
        period: "06.2025 — настоящее время",
        title: "Risk Analyst",
        subtitle: "Т-Банк",
        description:
          "Разработка LTV-модели для клиентов Т-Бизнеса из ME сегмента и поддержка задач привлечения.",
        details: [
          "Разрабатывал LTV-модель для оценки клиентов среднего бизнеса в Т-Бизнесе.",
          "Работал на стыке риска и acquisition, превращая аналитику в рабочий скоринговый слой.",
          "Расширил опыт продуктовой аналитики до кредитной и портфельной логики.",
        ],
        tags: ["Risk", "LTV", "Acquisition", "ME"],
      },
      {
        period: "05.2021 — 04.2025",
        title: "Аналитик / Middle Analyst",
        subtitle: "Яндекс",
        description:
          "Вел аналитику бонусов, перформ-сделок, аудита выплат и автоматизации кредитных линий.",
        details: [
          "Начал со стажировки в антифроде и повышал эффективность системы детекции.",
          "Вел аналитику продукта «Бонусы в Директе»: эффективность и выгодность.",
          "Строил и поддерживал дашборды для крупных performance deals.",
          "Проверял выплаты бонусов, находил критичные ошибки и внедрял контрольные механизмы.",
          "Использовал прогнозирование, в том числе на базе Prophet, для оценки выполнения сделок.",
          "Участвовал в автоматизации и повышении прозрачности выдачи кредитных линий агентствам.",
        ],
        tags: ["Яндекс Директ", "Forecasting", "Дашборды", "Audit", "Automation"],
      },
      {
        period: "2018 — 2020",
        title: "Преподаватель математики",
        subtitle: "Ульяновские школы · Сириус",
        description:
          "Интенсивные математические программы для школьников в зимних, летних и октябрьских сменах.",
        details: [
          "Вел по три двухчасовых пары в день для школьников 6-11 классов в зависимости от программы.",
          "Работал в зимних и летних математических школах несколько лет подряд.",
          "Также преподавал на октябрьских сменах в ОЦ «Сириус».",
        ],
        tags: ["Преподавание", "Математика", "Сириус", "Олимпиадная подготовка"],
      },
    ] satisfies TimelineEntry[],
    communityItems: [
      {
        period: "01.2019 — 10.2019",
        title: "Программист-разработчик",
        subtitle: "Экономическая Карусель",
        description:
          "Разработал Telegram-бота, автоматизировавшего соревнование и пользовательский поток.",
        details: [
          "Собрал общую структуру бота, UX, дебаг, хостинг и поддержку.",
          "Работал с JSON / NoSQL-подобным хранением, Telegram API, async job queue и inline-механиками.",
          "Разворачивал проект на VPS, в том числе на DigitalOcean и Heroku.",
          "Через систему прошло более 200 уникальных участников.",
        ],
        tags: ["Python", "Telegram API", "UX", "Hosting"],
      },
      {
        period: "03.2019",
        title: "Организатор / волонтер",
        subtitle: "Заключительный этап ВОШ по экономике",
        description:
          "Работал в оргкомитете и помогал готовить и проводить туры олимпиады.",
        details: [
          "Помогал с логистикой и операционной поддержкой финального этапа.",
          "Работал с олимпиадой уже не как участник, а как часть команды проведения.",
        ],
        tags: ["Operations", "Education", "Olympiad"],
      },
      {
        period: "12.2018",
        title: "Сборник тестов по экономике",
        subtitle: "Редакционная и техническая подготовка",
        description:
          "Отсортировал и сгруппировал 400+ задач и подготовил материалы в LaTeX.",
        details: [
          "Структурировал большой архив задач в формат, удобный для подготовки.",
          "Готовый сборник использовали тысячи школьников и студентов.",
        ],
        tags: ["LaTeX", "Контент-системы", "Экономика"],
      },
    ] satisfies TimelineEntry[],
    educationItems: [
      {
        period: "2022 — 2024",
        title: "Сколтех",
        subtitle: "MSc по Data Science",
        description:
          "Диплом с оценкой A и thesis по LiDAR semantic segmentation.",
        details: [
          "Тема: «Improving LiDAR Point Cloud Semantic Segmentation Using Global Maps».",
          "Сильный переход от классической аналитики к applied data science и 3D данным.",
        ],
        tags: ["ML", "LiDAR", "3D", "Skoltech"],
      },
      {
        period: "2018 — 2022",
        title: "НИУ ВШЭ и LSE track",
        subtitle: "Международный институт экономики и финансов",
        description:
          "Закончил программу в сильнейшей группе, доходя до топ-3 в промежуточных рейтингах.",
        details: [
          "Итоговый GPA 9.12/10 и топ-20 по выпускному рейтингу из 250+ студентов.",
          "В ранних версиях CV встречаются позиции топ-12, топ-7 и топ-3 в отдельных рейтингах.",
          "ICEF Academia: Calculus++, Economic Thinking, Advanced Statistics.",
          "Программа шла под академическим руководством University of London / LSE.",
        ],
        tags: ["ICEF", "Экономика", "Статистика", "ВШЭ", "LSE"],
      },
    ] satisfies TimelineEntry[],
    achievementItems: [
      {
        period: "2021",
        title: "Призер «Высшей лиги»",
        description: "По теории игр и прикладной математике.",
        details: [
          "Это уже университетский уровень и хороший маркер математической базы после школы.",
        ],
        tags: ["Теория игр", "Прикладная математика"],
      },
      {
        period: "2021",
        title: "Победитель конкурса research papers",
        description: "Конкурс студенческих работ ВШЭ по finance papers.",
        details: [
          "Показывает не только технические навыки, но и формальное исследовательское письмо.",
        ],
        tags: ["Research", "Finance"],
      },
      {
        period: "2015 — 2018",
        title: "Олимпиадный трек",
        description:
          "Двукратный призер по математике, призер по экономике, победитель и призер перечневых олимпиад.",
        details: [
          "Двукратный призер заключительного этапа ВОШ по математике.",
          "Призер заключительного этапа ВОШ по экономике.",
          "Победитель и призер перечневых олимпиад: Высшая проба, Воробьевы горы, Физтех, Турнир городов и другие.",
        ],
        tags: ["Математика", "Экономика", "Олимпиады"],
      },
    ] satisfies TimelineEntry[],
    skills: [
      {
        category: "Python",
        detail: "Продакшен-скрипты, боты, автоматизация и аналитическая инфраструктура.",
        items: [
          "Курсы с оценками 10/10 по programming and data processing и смежным data science дисциплинам.",
          "Работа с pandas, numpy, scipy, OpenPyXL, JSON и Telegram bot API.",
          "Async-боты, callback flow, job queues и деплой на VPS.",
        ],
        tools: ["pandas", "numpy", "scipy", "OpenPyXL", "Telegram API"],
      },
      {
        category: "SQL и аналитический стек",
        detail: "Запросы, продуктовая аналитика, payout checks и дашборды.",
        items: [
          "Регулярная аналитическая разработка на SQL.",
          "В старых версиях CV отдельно отмечены R, YQL flavor и Starlark.",
          "Опыт в дашбордах, прогнозировании, profitability checks и audit-задачах.",
        ],
        tools: ["SQL", "YQL", "R", "Prophet", "Dashboards"],
      },
      {
        category: "Системы",
        detail: "Linux-first подход с опытом хостинга и автоматизации.",
        items: [
          "В разных версиях CV опыт Linux растет от 3+ до 9+ лет.",
          "Комфортно с Bash, SSH, Docker и практическим деплоем.",
          "Разворачивал проекты на DigitalOcean, Heroku и VPS.",
        ],
        tools: ["Linux", "Bash", "SSH", "Docker", "VPS"],
      },
      {
        category: "Языки",
        detail: "Русский — родной, английский — advanced.",
        items: [
          "TOEFL 98 проходит через все версии CV.",
          "IELTS вырос с 7.5 до 8 в более поздних версиях.",
        ],
        tools: ["Русский", "English", "TOEFL 98", "IELTS 8"],
      },
      {
        category: "Другое",
        detail: "Хвост навыков, который обычно и двигает аналитическую работу.",
        items: [
          "LaTeX для учебных и исследовательских материалов.",
          "MS Office и EViews для классических econ / analytics workflow.",
        ],
        tools: ["LaTeX", "MS Office", "EViews"],
      },
    ] satisfies SkillEntry[],
    contacts: [
      {
        label: "Email",
        href: "mailto:aleksandr.odnakov010@gmail.com",
        text: "aleksandr.odnakov010@gmail.com",
      },
      { label: "Телефон", href: "tel:+79876322671", text: "+7 987 632 26 71" },
      { label: "GitHub", href: "https://github.com/ooodnakov", text: "github.com/ooodnakov" },
    ] satisfies ContactEntry[],
    actions: [
      { label: "PDF (EN)", href: "/cv-pdf/en" },
      { label: "PDF (RU)", href: "/cv-pdf/ru" },
      { label: "Архив", href: "/legacy/" },
    ] satisfies ActionEntry[],
    footer: "Москва · 2025",
    toggleThemeLabel: "Переключить тему",
  },
} as const;
