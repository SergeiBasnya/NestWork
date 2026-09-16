'use client';

import { useEffect, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowRight,
  Check,
  Coffee,
  ExternalLink,
  Github,
  Lock,
  MessageCircle,
  Mic,
  MonitorUp,
  Paintbrush,
  Users,
  Video,
  Wifi,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { LICENSED_ASSETS_ENABLED } from '../game/assetLibrary';
import { useAuthStore } from '../stores/auth';
import styles from './Landing.module.css';
import { GITHUB_URL, landingCopy, type LandingLocale } from './landingCopy';

const pilotEmail = process.env.NEXT_PUBLIC_PILOT_EMAIL || 'contact@nestwork.site';
const modernInteriorsUrl = 'https://limezu.itch.io/moderninteriors';

export default function Landing({ locale = 'fr' }: { locale?: LandingLocale }) {
  const router = useRouter();
  const authStatus = useAuthStore((state) => state.status);
  const copy = landingCopy[locale];
  const pilotHref = `mailto:${pilotEmail}?subject=${encodeURIComponent(copy.pilot.emailSubject)}&body=${encodeURIComponent(copy.pilot.emailBody)}`;

  useEffect(() => {
    if (authStatus === 'authenticated') router.replace('/workspace/nestwork');
  }, [authStatus, router]);

  return (
    <main className={styles.landing}>
      <header className={styles.header}>
        <Link
          href={locale === 'en' ? '/en' : '/'}
          aria-label={copy.homeLabel}
          className={styles.brandLink}
        >
          <Logo size={31} />
        </Link>
        <nav aria-label={copy.navLabel} className={styles.nav}>
          <a href="#produit">{copy.nav.product}</a>
          <a href="#fonctionnement">{copy.nav.how}</a>
          <a href="#open-source">{copy.nav.openSource}</a>
          <a href="#pilote">{copy.nav.pilot}</a>
        </nav>
        <div className={styles.headerActions}>
          <span className={styles.languageSwitch} aria-label={copy.languageLabel}>
            <Link
              href="/"
              hrefLang="fr"
              lang="fr"
              aria-current={locale === 'fr' ? 'page' : undefined}
            >
              FR
            </Link>
            <span aria-hidden>/</span>
            <Link
              href="/en"
              hrefLang="en"
              lang="en"
              aria-current={locale === 'en' ? 'page' : undefined}
            >
              EN
            </Link>
          </span>
          <Link href="/login" className={styles.loginLink}>
            {copy.login}
          </Link>
          <a href="#pilote" className={styles.headerCta}>
            {copy.headerCta}
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.pixelTag}>
            <span /> {copy.hero.tag}
          </p>
          <h1>
            {copy.hero.title} <mark>{copy.hero.mark}</mark>
          </h1>
          <p className={styles.heroLead}>{copy.hero.lead}</p>
          <div className={styles.heroActions}>
            <a href="#pilote" className={styles.primaryCta}>
              {copy.hero.primary} <ArrowRight size={18} aria-hidden />
            </a>
            <a href="#produit" className={styles.secondaryCta}>
              {copy.hero.secondary} <ArrowDown size={17} aria-hidden />
            </a>
          </div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.sourceLink}>
            <Github size={16} aria-hidden /> {copy.hero.source}
          </a>
          <div className={styles.heroMeta}>
            <span>
              <Wifi size={15} aria-hidden /> {copy.hero.browser}
            </span>
            <span>
              <Users size={15} aria-hidden /> {copy.hero.teamSize}
            </span>
          </div>
        </div>

        <PixelOffice locale={locale} />
      </section>

      <section className={styles.presenceBar} aria-label={copy.presence.label}>
        <p>
          <span className={styles.onlineDot} /> {copy.presence.online}
        </p>
        <div>
          <span>
            <Video size={16} aria-hidden /> {copy.presence.features[0]}
          </span>
          <span>
            <MessageCircle size={16} aria-hidden /> {copy.presence.features[1]}
          </span>
          <span>
            <MonitorUp size={16} aria-hidden /> {copy.presence.features[2]}
          </span>
          <span>
            <Paintbrush size={16} aria-hidden /> {copy.presence.features[3]}
          </span>
        </div>
      </section>

      <section id="produit" className={styles.productProof} aria-labelledby="product-proof-title">
        <div className={styles.productProofHeader}>
          <div>
            <p className={styles.sectionKicker}>{copy.proof.kicker}</p>
            <h2 id="product-proof-title">{copy.proof.title}</h2>
          </div>
          <p>{copy.proof.body}</p>
        </div>
        {LICENSED_ASSETS_ENABLED ? (
          <div className={styles.productGallery}>
            <ProductScreenshot
              href="/product/screenshots/workspace-overview.png"
              src="/product/screenshots/workspace-overview.png"
              width={3020}
              height={1460}
              index="01"
              title={copy.proof.shots[0][0]}
              description={copy.proof.shots[0][1]}
              openLabel={copy.proof.openShot(copy.proof.shots[0][0])}
              productPath={copy.proof.productPath}
              captureLabel={copy.proof.capture}
              priority
            />
            <ProductScreenshot
              href="/product/screenshots/proximity-conversation.png"
              src="/product/screenshots/proximity-conversation.png"
              width={3022}
              height={1542}
              index="02"
              title={copy.proof.shots[1][0]}
              description={copy.proof.shots[1][1]}
              openLabel={copy.proof.openShot(copy.proof.shots[1][0])}
              productPath={copy.proof.productPath}
              captureLabel={copy.proof.capture}
            />
            <ProductScreenshot
              href="/product/screenshots/map-editor.png"
              src="/product/screenshots/map-editor.png"
              width={3022}
              height={1466}
              index="03"
              title={copy.proof.shots[2][0]}
              description={copy.proof.shots[2][1]}
              openLabel={copy.proof.openShot(copy.proof.shots[2][0])}
              productPath={copy.proof.productPath}
              captureLabel={copy.proof.capture}
            />
          </div>
        ) : (
          <div className={styles.publicProductPreview}>
            <PixelOffice locale={locale} />
          </div>
        )}
      </section>

      <section className={styles.problemSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>{copy.problem.kicker}</p>
          <h2>{copy.problem.title}</h2>
        </div>
        <div className={styles.problemStory}>
          <div className={styles.oldWay}>
            <p className={styles.storyLabel}>{copy.problem.today}</p>
            <ChatLine time="10:02" text={copy.problem.chat[0]} />
            <ChatLine time="10:18" text={copy.problem.chat[1]} muted />
            <ChatLine time="10:31" text={copy.problem.chat[2]} muted />
            <p className={styles.storyResult}>{copy.problem.delay}</p>
          </div>
          <div className={styles.storyArrow} aria-hidden>
            <ArrowRight />
          </div>
          <div className={styles.nestWay}>
            <p className={styles.storyLabel}>{copy.problem.inNestWork}</p>
            <div className={styles.miniEncounter} aria-hidden>
              <PixelPortrait character="Aurore" />
              <span className={styles.encounterSignal}>
                <i />
                <i />
                <i />
              </span>
              <PixelPortrait character="Milo" />
            </div>
            <p className={styles.encounterTitle}>
              <span className={styles.onlineDot} /> {copy.problem.opened}
            </p>
            <p className={styles.storyResult}>{copy.problem.result}</p>
          </div>
        </div>
      </section>

      <section id="fonctionnement" className={styles.howSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>{copy.how.kicker}</p>
          <h2>{copy.how.title}</h2>
          <p>{copy.how.body}</p>
        </div>
        <ol className={styles.pixelPath}>
          <PathStep
            number="01"
            icon={<Users size={21} aria-hidden />}
            title={copy.how.steps[0][0]}
            body={copy.how.steps[0][1]}
          />
          <PathStep
            number="02"
            icon={<Video size={21} aria-hidden />}
            title={copy.how.steps[1][0]}
            body={copy.how.steps[1][1]}
            featured
          />
          <PathStep
            number="03"
            icon={<MessageCircle size={21} aria-hidden />}
            title={copy.how.steps[2][0]}
            body={copy.how.steps[2][1]}
          />
        </ol>
      </section>

      <section className={styles.featuresSection}>
        <div className={styles.featureIntro}>
          <p className={styles.sectionKicker}>{copy.features.kicker}</p>
          <h2>{copy.features.title}</h2>
          <p>{copy.features.body}</p>
        </div>
        <div className={styles.featureGrid}>
          <FeatureCard
            icon={<Mic size={21} aria-hidden />}
            title={copy.features.cards[0][0]}
            body={copy.features.cards[0][1]}
            motif="signal"
          />
          <FeatureCard
            icon={<MonitorUp size={21} aria-hidden />}
            title={copy.features.cards[1][0]}
            body={copy.features.cards[1][1]}
            motif="screen"
          />
          <FeatureCard
            icon={<MessageCircle size={21} aria-hidden />}
            title={copy.features.cards[2][0]}
            body={copy.features.cards[2][1]}
            motif="chat"
          />
          <FeatureCard
            icon={<Paintbrush size={21} aria-hidden />}
            title={copy.features.cards[3][0]}
            body={copy.features.cards[3][1]}
            motif="room"
          />
        </div>
      </section>

      <section className={styles.controlSection}>
        <div className={styles.controlCopy}>
          <p className={styles.sectionKicker}>{copy.control.kicker}</p>
          <h2>{copy.control.title}</h2>
          <p>{copy.control.body}</p>
          <div className={styles.controlList}>
            <Control
              icon={<Mic size={18} aria-hidden />}
              label={copy.control.microphone[0]}
              state={copy.control.microphone[1]}
            />
            <Control
              icon={<Video size={18} aria-hidden />}
              label={copy.control.camera[0]}
              state={copy.control.camera[1]}
            />
            <Control
              icon={<Lock size={18} aria-hidden />}
              label={copy.control.dnd[0]}
              state={copy.control.dnd[1]}
              active
            />
          </div>
        </div>
        <div className={styles.focusRoom} aria-hidden>
          <p>{copy.control.focusZone}</p>
          <div className={styles.pixelDoor}>
            <span />
          </div>
          <PixelPortrait character="Leo" large />
          <span className={styles.focusBadge}>
            <Lock size={12} /> {copy.control.focus}
          </span>
        </div>
      </section>

      <section
        id="open-source"
        className={styles.openSourceSection}
        aria-labelledby="open-source-title"
      >
        <div className={styles.openSourceMark} aria-hidden>
          <Github size={70} />
          <span>OPEN</span>
          <span>SOURCE</span>
        </div>
        <div className={styles.openSourceCopy}>
          <p className={styles.sectionKicker}>{copy.openSource.kicker}</p>
          <h2 id="open-source-title">{copy.openSource.title}</h2>
          <p>{copy.openSource.body}</p>
          <ul>
            {copy.openSource.points.map((point) => (
              <li key={point}>
                <Check size={17} aria-hidden /> {point}
              </li>
            ))}
          </ul>
          <div className={styles.openSourceActions}>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.primaryCta}>
              <Github size={18} aria-hidden /> {copy.openSource.cta}
            </a>
            <Link href="/credits">{copy.openSource.credits}</Link>
            <a href={modernInteriorsUrl} target="_blank" rel="noreferrer">
              {copy.openSource.limezu} <ExternalLink size={14} aria-hidden />
            </a>
          </div>
          <p className={styles.openSourceNote}>{copy.openSource.note}</p>
        </div>
      </section>

      <section id="pilote" className={styles.pilotSection}>
        <div className={styles.pilotScene} aria-hidden>
          <div className={styles.pilotGrid} />
          <div className={styles.coffeeCorner}>
            <Coffee size={19} />
          </div>
          <PixelPortrait character="Aurore" large />
          <PixelPortrait character="Milo" large />
          <PixelPortrait character="Leo" large />
          <span className={styles.pilotBubble}>{copy.pilot.bubble}</span>
        </div>
        <div className={styles.pilotCopy}>
          <p className={styles.sectionKicker}>{copy.pilot.kicker}</p>
          <h2>{copy.pilot.title}</h2>
          <p>{copy.pilot.body}</p>
          <ul>
            {copy.pilot.bullets.map((bullet) => (
              <li key={bullet}>
                <Check size={17} aria-hidden /> {bullet}
              </li>
            ))}
          </ul>
          <a href={pilotHref} className={styles.darkCta}>
            {copy.pilot.cta} <ArrowRight size={18} aria-hidden />
          </a>
          <p className={styles.mailNote}>{copy.pilot.note(pilotEmail)}</p>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>{copy.faq.kicker}</p>
          <h2>{copy.faq.title}</h2>
        </div>
        <div className={styles.faqList}>
          {copy.faq.items.map(([question, answer]) => (
            <Faq key={question} question={question}>
              {answer}
            </Faq>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalAvatars} aria-hidden>
          {['P03', 'P06', 'P10', 'P15'].map((character) => (
            <PixelPortrait key={character} character={character} />
          ))}
        </div>
        <p className={styles.sectionKicker}>{copy.final.kicker}</p>
        <h2>{copy.final.title}</h2>
        <a href={pilotHref} className={styles.primaryCta}>
          {copy.final.cta} <ArrowRight size={18} aria-hidden />
        </a>
      </section>

      <footer className={styles.footer}>
        <Logo size={27} />
        <p>{copy.footer.description}</p>
        <div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            {copy.footer.source}
          </a>
          <a href={`mailto:${pilotEmail}`}>{copy.footer.contact}</a>
          <Link href="/credits">{copy.footer.credits}</Link>
          <Link href="/login">{copy.footer.login}</Link>
        </div>
        <p>© {new Date().getFullYear()} NestWork</p>
      </footer>
    </main>
  );
}

function PixelOffice({ locale }: { locale: LandingLocale }) {
  const copy = landingCopy[locale].office;
  return (
    <figure className={styles.officeFigure}>
      <div className={styles.officeWindow}>
        <div className={styles.officeTopbar}>
          <span className={styles.windowDots}>
            <i />
            <i />
            <i />
          </span>
          <strong>{copy.room}</strong>
          <span>
            <i className={styles.onlineDot} /> {copy.online}
          </span>
        </div>
        <svg
          className={styles.officeScene}
          viewBox="0 0 720 470"
          role="img"
          aria-labelledby="office-title office-desc"
        >
          <title id="office-title">{copy.title}</title>
          <desc id="office-desc">{copy.description}</desc>
          <defs>
            <pattern id="floor-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <rect width="32" height="32" fill="#F2EFE8" />
              <path d="M32 0H0V32" fill="none" stroke="#E8E4DB" strokeWidth="2" />
              <path d="M0 31H32M31 0V32" stroke="#FFFFFF" strokeOpacity=".65" />
            </pattern>
            <filter id="pixel-shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow
                dx="5"
                dy="7"
                stdDeviation="0"
                floodColor="#18191D"
                floodOpacity=".22"
              />
            </filter>
          </defs>
          <rect width="720" height="470" fill="#18191D" />
          <rect x="52" y="0" width="668" height="470" fill="url(#floor-grid)" />
          <rect width="52" height="470" fill="#0F1013" />
          <g className={styles.sceneRail}>
            <rect x="12" y="18" width="28" height="32" fill="#FFC500" />
            <text x="26" y="39" textAnchor="middle">
              N
            </text>
            <rect x="13" y="78" width="26" height="26" rx="3" />
            <rect x="13" y="116" width="26" height="26" rx="3" />
            <rect x="13" y="154" width="26" height="26" rx="3" />
          </g>
          <path d="M77 26H695V444H77Z" fill="none" stroke="#18191D" strokeWidth="8" />
          <path d="M440 30V184H692M440 184H692" fill="none" stroke="#51545C" strokeWidth="5" />
          <text x="94" y="54" className={styles.roomLabel}>
            {copy.commonSpace}
          </text>
          <text x="458" y="54" className={styles.roomLabel}>
            {copy.focus}
          </text>
          <text x="458" y="211" className={styles.roomLabel}>
            {copy.coffee}
          </text>

          <PixelOfficeFurniture />

          <circle
            cx="292"
            cy="247"
            r="91"
            fill="#FFC500"
            fillOpacity=".13"
            stroke="#CC8C00"
            strokeWidth="3"
            strokeDasharray="8 8"
          />
          <path d="M283 258H315" stroke="#6FA332" strokeWidth="3" strokeDasharray="4 5" />
          <MemberLabel name="Sébastien" x={218} y={207} width={71} />
          <MemberLabel name="Pierre" x={308} y={222} width={52} />
          <PixelCharacter character="Aurore" x={246} y={225} />
          <PixelCharacter character="Milo" x={315} y={240} />
          <PixelCharacter character="Leo" x={508} y={112} />
          <PixelCharacter character="Aurore" x={519} y={282} />

          <g className={styles.conversationChip}>
            <rect x="237" y="317" width="171" height="31" />
            <circle cx="253" cy="332" r="5" />
            <text x="265" y="337">
              {copy.opened}
            </text>
          </g>
        </svg>
      </div>
      <figcaption>
        <span>{copy.preview}</span> {copy.caption}
      </figcaption>
    </figure>
  );
}

function ProductScreenshot({
  href,
  src,
  width,
  height,
  index,
  title,
  description,
  openLabel,
  productPath,
  captureLabel,
  priority = false,
}: {
  href: string;
  src: string;
  width: number;
  height: number;
  index: string;
  title: string;
  description: string;
  openLabel: string;
  productPath: string;
  captureLabel: string;
  priority?: boolean;
}) {
  return (
    <figure className={styles.productShot}>
      <a href={href} target="_blank" rel="noreferrer" aria-label={openLabel}>
        <span className={styles.productShotBar} aria-hidden="true">
          <span>
            <i />
            <i />
            <i />
          </span>
          <strong>{productPath}</strong>
          <em>
            {captureLabel} {index}/03
          </em>
        </span>
        <span className={styles.productShotViewport}>
          <Image
            src={src}
            width={width}
            height={height}
            sizes={
              index === '01'
                ? '(max-width: 760px) 100vw, 1120px'
                : '(max-width: 760px) 100vw, 550px'
            }
            alt={description}
            priority={priority}
          />
        </span>
      </a>
      <figcaption>
        <span>{index}</span>
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      </figcaption>
    </figure>
  );
}

function PixelOfficeFurniture() {
  return (
    <g aria-hidden="true" className={styles.pixelFurniture} filter="url(#pixel-shadow)">
      {/* Bureau partagé avec deux petits écrans, à l’échelle de la grille. */}
      <g transform="translate(196 132) scale(.75)">
        <rect x="4" y="7" width="270" height="31" fill="#18191D" opacity=".18" />
        <rect x="39" y="-33" width="54" height="34" fill="#303239" />
        <rect x="44" y="-28" width="44" height="24" fill="#D9DCE4" />
        <rect x="62" y="1" width="8" height="8" fill="#51545C" />
        <rect x="51" y="9" width="30" height="5" fill="#51545C" />
        <rect x="177" y="-33" width="54" height="34" fill="#303239" />
        <rect x="182" y="-28" width="44" height="24" fill="#D9DCE4" />
        <rect x="200" y="1" width="8" height="8" fill="#51545C" />
        <rect x="189" y="9" width="30" height="5" fill="#51545C" />
        <rect width="270" height="13" fill="#303239" />
        <rect x="4" y="4" width="262" height="13" fill="#F6A24A" />
        <rect x="4" y="17" width="262" height="10" fill="#D86A23" />
        <rect x="14" y="27" width="12" height="38" fill="#51545C" />
        <rect x="240" y="27" width="12" height="38" fill="#51545C" />
        <rect x="18" y="27" width="4" height="32" fill="#858995" />
        <rect x="244" y="27" width="4" height="32" fill="#858995" />
      </g>

      {/* Banquette de l’open space. */}
      <g transform="translate(116 368) scale(.72)">
        <rect x="5" y="7" width="126" height="55" fill="#18191D" opacity=".18" />
        <rect x="8" width="112" height="15" fill="#51545C" />
        <rect x="4" y="7" width="120" height="28" fill="#7479B8" />
        <rect x="10" y="11" width="50" height="18" fill="#9196CF" />
        <rect x="64" y="11" width="50" height="18" fill="#858AC7" />
        <rect y="33" width="128" height="12" fill="#303239" />
        <rect x="10" y="45" width="12" height="12" fill="#51545C" />
        <rect x="106" y="45" width="12" height="12" fill="#51545C" />
      </g>

      {/* Meuble bas et plante, entièrement contenus dans la scène. */}
      <g transform="translate(309 369) scale(.72)">
        <rect x="5" y="7" width="112" height="63" fill="#18191D" opacity=".18" />
        <rect width="112" height="12" fill="#303239" />
        <rect x="4" y="4" width="104" height="13" fill="#F6A24A" />
        <rect x="4" y="17" width="104" height="39" fill="#D9DCE4" />
        <rect x="10" y="23" width="43" height="27" fill="#F7F5EF" />
        <rect x="59" y="23" width="43" height="27" fill="#ECE9E2" />
        <rect x="55" y="17" width="4" height="39" fill="#51545C" />
        <rect x="16" y="56" width="10" height="9" fill="#51545C" />
        <rect x="86" y="56" width="10" height="9" fill="#51545C" />
        <rect x="43" y="-20" width="26" height="20" fill="#F77F00" />
        <rect x="48" y="-33" width="16" height="16" fill="#6FA332" />
        <rect x="42" y="-27" width="28" height="9" fill="#6FA332" />
        <rect x="51" y="-40" width="10" height="12" fill="#91C453" />
      </g>

      {/* Bibliothèque de la salle focus. */}
      <g transform="translate(636 82) scale(.82)">
        <rect x="5" y="7" width="50" height="91" fill="#18191D" opacity=".18" />
        <rect width="50" height="91" fill="#303239" />
        <rect x="5" y="5" width="40" height="77" fill="#F7F5EF" />
        <rect x="5" y="29" width="40" height="5" fill="#51545C" />
        <rect x="5" y="56" width="40" height="5" fill="#51545C" />
        <rect x="10" y="13" width="7" height="16" fill="#7479B8" />
        <rect x="19" y="9" width="8" height="20" fill="#F6A24A" />
        <rect x="29" y="15" width="10" height="14" fill="#6FA332" />
        <rect x="10" y="40" width="11" height="16" fill="#F77F00" />
        <rect x="24" y="36" width="7" height="20" fill="#9196CF" />
        <rect x="33" y="43" width="7" height="13" fill="#6FA332" />
        <rect x="10" y="66" width="30" height="10" fill="#FFDB66" />
        <rect x="8" y="82" width="8" height="9" fill="#51545C" />
        <rect x="34" y="82" width="8" height="9" fill="#51545C" />
      </g>

      {/* Comptoir café. */}
      <g transform="translate(596 371) scale(.76)">
        <rect x="5" y="7" width="94" height="70" fill="#18191D" opacity=".18" />
        <rect width="94" height="12" fill="#303239" />
        <rect x="4" y="4" width="86" height="12" fill="#F6A24A" />
        <rect x="5" y="16" width="84" height="48" fill="#51545C" />
        <rect x="11" y="23" width="33" height="35" fill="#F7F5EF" />
        <rect x="50" y="23" width="33" height="35" fill="#D9DCE4" />
        <rect x="19" y="-16" width="28" height="20" fill="#303239" />
        <rect x="23" y="-12" width="20" height="12" fill="#858995" />
        <rect x="27" y="-9" width="12" height="5" fill="#18191D" />
        <rect x="64" y="-10" width="13" height="13" fill="#FFC500" />
        <rect x="67" y="-14" width="7" height="5" fill="#FFFDF7" />
        <rect x="14" y="64" width="10" height="8" fill="#303239" />
        <rect x="70" y="64" width="10" height="8" fill="#303239" />
      </g>
    </g>
  );
}

function MemberLabel({ name, x, y, width }: { name: string; x: number; y: number; width: number }) {
  return (
    <g className={styles.memberLabel} transform={`translate(${x} ${y})`}>
      <rect width={width} height="16" />
      <circle cx="9" cy="8" r="3" />
      <text x="16" y="11">
        {name}
      </text>
    </g>
  );
}

function PixelCharacter({
  character,
  x,
  y,
  scale = 0.75,
}: {
  character: string;
  x: number;
  y: number;
  scale?: number;
}) {
  return (
    <svg
      x={x}
      y={y}
      width={48 * scale}
      height={64 * scale}
      viewBox="864 0 48 64"
      className={styles.pixelImage}
    >
      <image href={`/Characters/original/${character}_idle.png`} width="1152" height="64" />
    </svg>
  );
}

function PixelPortrait({ character, large = false }: { character: string; large?: boolean }) {
  return (
    <span
      className={`${styles.pixelPortrait} ${large ? styles.pixelPortraitLarge : ''}`}
      style={{ backgroundImage: `url(/Characters/original/${character}_idle.png)` }}
    />
  );
}

function ChatLine({ time, text, muted = false }: { time: string; text: string; muted?: boolean }) {
  return (
    <div className={`${styles.chatLine} ${muted ? styles.chatMuted : ''}`}>
      <span>{time}</span>
      <p>{text}</p>
    </div>
  );
}

function PathStep({
  number,
  icon,
  title,
  body,
  featured = false,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  body: string;
  featured?: boolean;
}) {
  return (
    <li className={featured ? styles.pathFeatured : undefined}>
      <span className={styles.pathNumber}>{number}</span>
      <span className={styles.pathIcon}>{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </li>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  motif,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  motif: string;
}) {
  return (
    <article className={styles.featureCard}>
      <div className={`${styles.featureVisual} ${styles[motif]}`} aria-hidden>
        <span />
        <i />
        <b />
      </div>
      <span className={styles.featureIcon}>{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function Control({
  icon,
  label,
  state,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  state: string;
  active?: boolean;
}) {
  return (
    <div className={styles.control}>
      <span>{icon}</span>
      <strong>{label}</strong>
      <small>{state}</small>
      <i className={active ? styles.switchActive : undefined} />
    </div>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className={styles.faqItem}>
      <summary>
        {question}
        <span aria-hidden>+</span>
      </summary>
      <p>{children}</p>
    </details>
  );
}
