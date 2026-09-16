export type LandingLocale = 'fr' | 'en';

export const GITHUB_URL = 'https://github.com/SergeiBasnya/NestWork';

export const landingCopy = {
  fr: {
    homeLabel: 'Accueil NestWork',
    navLabel: 'Navigation principale',
    nav: {
      product: 'Le produit',
      how: 'Comment ça marche',
      openSource: 'Open source',
      pilot: 'Le pilote',
    },
    login: 'Connexion',
    headerCta: 'Tester avec mon équipe',
    languageLabel: 'Langue',
    hero: {
      tag: 'QG virtuel 2D · projet open source',
      title: 'Le bureau où ton équipe se retrouve',
      mark: 'vraiment.',
      lead: 'Tu vois qui est là, tu déplaces ton avatar et tu t’approches d’un collègue : la conversation commence. Plus besoin de planifier une réunion pour une question de deux minutes.',
      primary: 'Tester avec mon équipe',
      secondary: 'Explorer NestWork',
      source: 'Suivre le projet sur GitHub',
      browser: 'Dans le navigateur',
      teamSize: 'Pensé pour 4 à 12 personnes',
    },
    presence: {
      label: 'Fonctions principales',
      online: '4 membres dans l’espace',
      features: [
        'Visio de proximité',
        'Chat persistant',
        'Partage d’écran',
        'Bureau personnalisable',
      ],
    },
    proof: {
      kicker: 'Captures réelles du produit',
      title: 'NestWork tourne déjà.',
      body: 'Un bureau partagé, des conversations qui s’ouvrent quand les collègues se rapprochent et un décor que l’équipe peut façonner elle-même. Ici, ce ne sont pas des maquettes.',
      openShot: (title: string) => `Ouvrir la capture « ${title} » en grand`,
      productPath: 'nestwork.app / produit',
      capture: 'CAPTURE',
      shots: [
        [
          'Un espace de travail vivant',
          'Plusieurs zones, plusieurs usages, une seule présence d’équipe.',
        ],
        [
          'La conversation démarre sur place',
          'Deux avatars se rapprochent : l’échange audio et vidéo s’ouvre.',
        ],
        [
          'Le bureau se construit dans le produit',
          'Sols, murs, mobilier et zones se placent depuis le décorateur.',
        ],
      ],
    },
    problem: {
      kicker: 'Pourquoi NestWork ?',
      title: 'À distance, les petites conversations sont devenues les plus compliquées.',
      today: 'Aujourd’hui',
      chat: ['Tu as deux minutes ?', 'Oui, on se fait un call ?', 'Je t’envoie une invitation…'],
      delay: '29 minutes pour démarrer une conversation.',
      inNestWork: 'Dans NestWork',
      opened: 'Conversation ouverte',
      result: 'S’approcher. Parler. Continuer.',
    },
    how: {
      kicker: 'Une journée dans l’espace',
      title: 'Tout part de la présence.',
      body: 'Le décor n’est pas un habillage : c’est l’interface qui permet de comprendre où sont les autres et comment les rejoindre.',
      steps: [
        [
          'Entre dans ton bureau',
          'Ton avatar apparaît dans l’espace. Tu vois immédiatement qui est connecté, occupé ou disponible.',
        ],
        [
          'Approche-toi d’un collègue',
          'La proximité ouvre la conversation. Chacun garde le contrôle de son micro, de sa caméra et du mode Ne pas déranger.',
        ],
        [
          'Garde le fil',
          'Canaux, messages privés, réactions et non-lus conservent le contexte après l’échange.',
        ],
      ],
    },
    features: {
      kicker: 'Un vrai espace de travail',
      title: 'Pas juste des avatars sur une carte.',
      body: 'NestWork réunit les outils nécessaires aux échanges quotidiens, sans essayer de devenir une suite logicielle de plus.',
      cards: [
        [
          'Parler naturellement',
          'Audio et vidéo se déclenchent avec la proximité, puis se coupent quand tu t’éloignes.',
        ],
        [
          'Montrer ton écran',
          'Regarde une maquette, un document ou un bug ensemble, directement depuis l’espace.',
        ],
        [
          'Continuer par écrit',
          'Canaux, messages directs, mentions, images et réactions restent disponibles après la discussion.',
        ],
        [
          'Construire votre lieu',
          'Place les bureaux, choisis les salles et crée un environnement que l’équipe reconnaît.',
        ],
      ],
    },
    control: {
      kicker: 'Présent ne veut pas dire dérangé',
      title: 'Tu restes maître de ton bureau.',
      body: 'La présence donne un contexte, pas un droit d’interrompre. Micro et caméra sont désactivés à l’arrivée, et le mode Ne pas déranger ferme la porte.',
      microphone: ['Micro', 'Désactivé'],
      camera: ['Caméra', 'Désactivée'],
      dnd: ['Ne pas déranger', 'Disponible'],
      focusZone: 'ZONE FOCUS',
      focus: 'Concentration',
    },
    openSource: {
      kicker: 'Projet open source',
      title: 'Un bureau que ton équipe peut faire sien.',
      body: 'NestWork est conçu pour être publié en open source. Le dépôt, la licence du code et la séparation des ressources tierces sont en cours de préparation.',
      points: ['Code bientôt public', 'Déploiement maîtrisé', 'Contributions après publication'],
      cta: 'Suivre le projet sur GitHub',
      note: 'Les ressources graphiques tierces restent soumises à leur licence propre ; leur origine est détaillée dans les crédits.',
      credits: 'Consulter les crédits',
    },
    pilot: {
      kicker: 'Pilote accompagné · 4 à 12 personnes',
      title: 'On prépare le bureau avec toi.',
      body: 'Nous cadrons les usages, créons les accès et accompagnons la première prise en main. Ton équipe teste ensuite NestWork dans une vraie semaine de travail.',
      bullets: [
        'Un espace configuré pour l’équipe',
        'Un démarrage collectif',
        'Un bilan honnête sur les usages',
      ],
      cta: 'Candidater au pilote',
      note: (email: string) =>
        `Le bouton prépare un e-mail à ${email}. Rien n’est envoyé automatiquement.`,
      bubble: 'Bienvenue dans votre espace !',
      emailSubject: 'Candidature au pilote NestWork',
      emailBody: `Bonjour,

Je souhaite tester NestWork avec mon équipe.

Nom :
Entreprise :
Taille de l'équipe :
Organisation (remote / hybride) :
Le dernier échange qui aurait dû rester simple :

Merci.`,
    },
    faq: {
      kicker: 'Avant d’entrer',
      title: 'Questions fréquentes.',
      items: [
        [
          'Faut-il installer une application ?',
          'Non. NestWork s’utilise dans un navigateur sur ordinateur.',
        ],
        [
          'Le micro et la caméra restent-ils ouverts ?',
          'Non. Ils sont désactivés à l’arrivée et restent sous le contrôle de chaque membre.',
        ],
        [
          'Est-ce un remplacement de Slack ou Teams ?',
          'Non. NestWork ajoute un lieu de présence et facilite les échanges spontanés ; il complète les outils déjà utilisés par l’équipe.',
        ],
        [
          'Le projet est-il open source ?',
          'La publication open source est en préparation. Le dépôt et sa licence seront ouverts une fois les ressources graphiques tierces correctement séparées.',
        ],
        [
          'À qui s’adresse le pilote ?',
          'Aux équipes de 4 à 12 personnes qui travaillent régulièrement aux mêmes horaires, à distance ou en hybride.',
        ],
      ],
    },
    final: {
      kicker: 'Le bureau est ouvert',
      title: 'Et si ton équipe se retrouvait vraiment demain matin ?',
      cta: 'Tester NestWork',
    },
    footer: {
      description: 'Le bureau virtuel 2D pour petites équipes, bientôt publié en open source.',
      source: 'Projet GitHub',
      contact: 'Contact',
      credits: 'Crédits',
      login: 'Connexion',
    },
    office: {
      room: 'Salle commune',
      online: '4 en ligne',
      title: 'Un bureau virtuel NestWork en pixel art',
      description:
        'Quatre collègues se déplacent entre des bureaux. Sébastien et Pierre sont proches et leur conversation est ouverte.',
      commonSpace: 'OPEN SPACE',
      focus: 'FOCUS',
      coffee: 'COIN CAFÉ',
      opened: 'CONVERSATION OUVERTE',
      preview: 'APERÇU DU PRODUIT',
      caption: 'Deux avatars se rapprochent, la conversation s’ouvre.',
    },
  },
  en: {
    homeLabel: 'NestWork home',
    navLabel: 'Main navigation',
    nav: { product: 'Product', how: 'How it works', openSource: 'Open source', pilot: 'Pilot' },
    login: 'Sign in',
    headerCta: 'Try it with my team',
    languageLabel: 'Language',
    hero: {
      tag: '2D virtual HQ · open-source project',
      title: 'The office where your team actually',
      mark: 'meets.',
      lead: 'See who is around, move your avatar and walk up to a teammate: the conversation starts. No need to schedule a meeting for a two-minute question.',
      primary: 'Try it with my team',
      secondary: 'Explore NestWork',
      source: 'Follow the project on GitHub',
      browser: 'Runs in your browser',
      teamSize: 'Designed for teams of 4 to 12',
    },
    presence: {
      label: 'Core features',
      online: '4 people in the space',
      features: ['Proximity video', 'Persistent chat', 'Screen sharing', 'Customizable office'],
    },
    proof: {
      kicker: 'Real product screenshots',
      title: 'NestWork is already running.',
      body: 'A shared office, conversations that open when teammates walk closer, and a space the team can shape together. These are product screenshots, not mockups.',
      openShot: (title: string) => `Open “${title}” full size`,
      productPath: 'nestwork.app / product',
      capture: 'SCREENSHOT',
      shots: [
        ['A living workspace', 'Several areas and ways of working, with one shared team presence.'],
        [
          'The conversation starts right there',
          'Two avatars walk closer and their audio and video conversation opens.',
        ],
        [
          'Build the office inside the product',
          'Place floors, walls, furniture and zones from the map editor.',
        ],
      ],
    },
    problem: {
      kicker: 'Why NestWork?',
      title: 'Remote work made the smallest conversations the hardest to start.',
      today: 'Today',
      chat: ['Got two minutes?', 'Sure. Want to jump on a call?', 'I’ll send you an invite…'],
      delay: '29 minutes to start a conversation.',
      inNestWork: 'In NestWork',
      opened: 'Conversation open',
      result: 'Walk over. Talk. Carry on.',
    },
    how: {
      kicker: 'A day in the space',
      title: 'It all starts with presence.',
      body: 'The office is the interface: it shows where people are, whether they are available and how to reach them.',
      steps: [
        [
          'Enter your office',
          'Your avatar appears in the space. See at a glance who is online, busy or available.',
        ],
        [
          'Walk up to a teammate',
          'Proximity opens the conversation. Everyone stays in control of their microphone, camera and Do Not Disturb status.',
        ],
        [
          'Keep the context',
          'Channels, direct messages, reactions and unread counts keep the thread going after the conversation.',
        ],
      ],
    },
    features: {
      kicker: 'A real place to work',
      title: 'More than avatars on a map.',
      body: 'NestWork brings everyday team communication into one shared place without trying to replace every tool you already use.',
      cards: [
        [
          'Talk naturally',
          'Audio and video start when teammates move closer, then stop when they walk away.',
        ],
        [
          'Share your screen',
          'Review a design, a document or a bug together without leaving the space.',
        ],
        [
          'Continue in writing',
          'Channels, direct messages, mentions, images and reactions stay available after the conversation.',
        ],
        [
          'Build your own place',
          'Arrange desks and rooms to create an office your team recognizes as its own.',
        ],
      ],
    },
    control: {
      kicker: 'Present does not mean interruptible',
      title: 'You stay in control of your office.',
      body: 'Presence gives context, not permission to interrupt. Your microphone and camera start off, and Do Not Disturb closes the door.',
      microphone: ['Microphone', 'Off'],
      camera: ['Camera', 'Off'],
      dnd: ['Do Not Disturb', 'Available'],
      focusZone: 'FOCUS ZONE',
      focus: 'Focus time',
    },
    openSource: {
      kicker: 'Open-source project',
      title: 'An office your team can make its own.',
      body: 'NestWork is being prepared for an open-source release. The repository, code license and separation of third-party assets are currently being finalized.',
      points: ['Public code coming soon', 'Control your deployment', 'Contributions after release'],
      cta: 'Follow the project on GitHub',
      note: 'Third-party visual assets remain covered by their own licenses; every source is documented on the credits page.',
      credits: 'Read the credits',
    },
    pilot: {
      kicker: 'Guided pilot · teams of 4 to 12',
      title: 'We set up the office with you.',
      body: 'We define how your team will use the space, create access and guide the first session. Your team then uses NestWork through a real working week.',
      bullets: [
        'A space configured for your team',
        'A guided team kickoff',
        'An honest review of how it worked',
      ],
      cta: 'Apply for the pilot',
      note: (email: string) =>
        `This button prepares an email to ${email}. Nothing is sent automatically.`,
      bubble: 'Welcome to your space!',
      emailSubject: 'NestWork pilot application',
      emailBody: `Hello,

I would like to test NestWork with my team.

Name:
Company:
Team size:
Work setup (remote / hybrid):
The last conversation that should have been easy:

Thank you.`,
    },
    faq: {
      kicker: 'Before you come in',
      title: 'Frequently asked questions.',
      items: [
        ['Do I need to install an app?', 'No. NestWork runs in a desktop web browser.'],
        [
          'Do the microphone and camera stay on?',
          'No. They start off and remain under each team member’s control.',
        ],
        [
          'Does it replace Slack or Teams?',
          'No. NestWork adds a shared sense of place and makes spontaneous conversations easier. It works alongside the tools your team already uses.',
        ],
        [
          'Is the project open source?',
          'The open-source release is in preparation. The repository and its license will become public once third-party visual assets have been properly separated.',
        ],
        [
          'Who is the pilot for?',
          'Teams of 4 to 12 that regularly work the same hours, either remotely or in a hybrid setup.',
        ],
      ],
    },
    final: {
      kicker: 'The office is open',
      title: 'What if your team could meet there tomorrow morning?',
      cta: 'Try NestWork',
    },
    footer: {
      description: 'The 2D virtual office for small remote teams, preparing for open-source release.',
      source: 'GitHub project',
      contact: 'Contact',
      credits: 'Credits',
      login: 'Sign in',
    },
    office: {
      room: 'Common room',
      online: '4 online',
      title: 'A NestWork virtual office in pixel art',
      description:
        'Four teammates move between desks. Sébastien and Pierre are close to each other, so their conversation is open.',
      commonSpace: 'OPEN SPACE',
      focus: 'FOCUS',
      coffee: 'COFFEE CORNER',
      opened: 'CONVERSATION OPEN',
      preview: 'PRODUCT PREVIEW',
      caption: 'Two avatars walk closer and the conversation opens.',
    },
  },
} as const;
