const CHEM_FORMULA_REGEX = /(Cs8Nb6O19|C60|NO3|O3)/g;
const CHEM_FORMULAS = new Set(["Cs8Nb6O19", "C60", "NO3", "O3"]);

function renderChemFormula(token, keyPrefix, formulaClassName, subClassName) {
  if (token === "Cs8Nb6O19") {
    return (
      <span className={formulaClassName} key={keyPrefix}>
        Cs<sub className={subClassName}>8</sub>Nb
        <sub className={subClassName}>6</sub>O
        <sub className={subClassName}>19</sub>
      </span>
    );
  }

  if (token === "C60") {
    return (
      <span className={formulaClassName} key={keyPrefix}>
        C<sub className={subClassName}>60</sub>
      </span>
    );
  }

  if (token === "NO3") {
    return (
      <span className={formulaClassName} key={keyPrefix}>
        NO<sub className={subClassName}>3</sub>
      </span>
    );
  }

  if (token === "O3") {
    return (
      <span className={formulaClassName} key={keyPrefix}>
        O<sub className={subClassName}>3</sub>
      </span>
    );
  }

  return token;
}

function renderTitleParts(title, formulaClassName, subClassName) {
  return String(title)
    .split(CHEM_FORMULA_REGEX)
    .map((part, index) => {
      if (CHEM_FORMULAS.has(part)) {
        return renderChemFormula(
          part,
          `chem-${index}`,
          formulaClassName,
          subClassName,
        );
      }
      return <span key={`txt-${index}`}>{part}</span>;
    });
}

export default function PublicationTitle({
  title,
  className,
  formulaClassName,
  subClassName,
}) {
  return (
    <h2 className={className}>
      {renderTitleParts(title, formulaClassName, subClassName)}
    </h2>
  );
}
