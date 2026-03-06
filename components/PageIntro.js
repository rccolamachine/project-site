export default function PageIntro({ title, lede, actions = null }) {
  return (
    <header className="pageIntro">
      <div className="pageIntroMain">
        <h1>{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {actions ? <div className="pageIntroActions">{actions}</div> : null}
    </header>
  );
}
