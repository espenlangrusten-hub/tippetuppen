# Skills

Design- og UI-skills fra [emilkowalski/skills](https://github.com/emilkowalski/skills),
hentet fra commit `85e8e23`. MIT-lisens; lisensteksten ligger i
`LICENSE-emilkowalski` og må følge med hvis filene flyttes videre.

De ligger her framfor i `~/.claude/skills/` slik at de følger repoet og virker for
alle som jobber på Tippetuppen, ikke bare på én maskin.

| Skill | Hva den gjør | Starter av seg selv |
| --- | --- | --- |
| `emil-design-eng` | Når noe bør animeres, `:active`-tilstander, `transform-origin`. Svarer med Before/After-tabell. | ja |
| `apple-design` | Spring-animasjoner, gestures, sheets, materialer, typografi. | ja |
| `pick-ui-library` | Kuratert bibliotekvalg: tall-input, OTP, charts, command menu, drag & drop. | nei, `/pick-ui-library` |
| `prototype` | Bygger flere versjoner av én UI-bit bak en visuell velger. | nei, `/prototype` |

De to nederste er merket `disable-model-invocation: true` og kjører bare når de kalles
med skråstrek.

Repoet har ni skills til, de fleste om animasjon (`animate`, `improve-animations`,
`review-animations`, `animation-vocabulary`, `find-animation-opportunities`,
`animate-expo`, `mobile-native`, `write-swift`, `ask-sonner`). De er ikke tatt inn her.

## Merk: Kjappen har designfrys

`emil-design-eng` og `apple-design` er review-skills - de foreslår endringer, og de
starter av seg selv når en forespørsel treffer beskrivelsen deres. Så lenge frysen på
Kjappen står, er forslagene deres til vurdering, ikke til å gjennomføre.
