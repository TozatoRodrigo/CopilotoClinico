import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DEMO_CASE_PRESETS } from "@/lib/demo-case-presets";

const TYPE_SCALE = [
  { token: "text-xs", px: "12px" },
  { token: "text-sm", px: "13.5px" },
  { token: "text-base", px: "15px" },
  { token: "text-lg", px: "17px" },
  { token: "text-xl", px: "21px" },
  { token: "text-2xl", px: "28px" },
  { token: "text-3xl", px: "36px" },
] as const;

const demoCase = DEMO_CASE_PRESETS[0];

export default function TypeSpecimenPage() {
  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-8">
      <div className="space-y-1">
        <h1 className="font-display text-3xl text-foreground">
          {demoCase.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          /dev/type — specimen dos 3 papéis tipográficos (display, corpo, dados)
          aplicados ao caso &ldquo;{demoCase.slug}&rdquo;
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Display — DM Serif Display</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Uso contido: apenas títulos de tela, números de destaque e
            momentos de marca. O título acima é a única ocorrência desta
            página.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">UI / corpo — DM Sans</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <span className="text-sm font-medium text-foreground">
              Resumo do caso
            </span>
            <p className="text-base leading-normal text-foreground">
              {demoCase.caseText}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Contexto: {demoCase.vertical}</Badge>
            {Object.entries(demoCase.context)
              .filter(([, value]) => value)
              .map(([key]) => (
                <Badge key={key} variant="secondary">
                  {key}
                </Badge>
              ))}
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Escala tipográfica
            </span>
            <div className="space-y-1">
              {TYPE_SCALE.map(({ token, px }) => (
                <div key={token} className="flex items-baseline gap-3">
                  <span
                    className={`${token} text-foreground`}
                  >
                    Síndrome gripal há 3 dias, sem sinais de SRAG.
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {token} / {px}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dados — IBM Plex Mono</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Usado para hashes de auditoria, IDs de chunk, patientRef e
            citações técnicas.
          </p>
          <dl className="space-y-1 font-mono text-sm text-foreground">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">patientRef:</dt>
              <dd>{demoCase.patientRef}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">auditHash:</dt>
              <dd>3f9a1c7e2b6d4f08a51c9e3b7d2f1a6c8e0b4d7f2a9c1e6b3d8f0a2c4e6b8d1f</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">chunkId:</dt>
              <dd>kb-001-top20-ps/01-sindrome-gripal-ivas#chunk-03</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
