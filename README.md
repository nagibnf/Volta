# VOLTA

Pilot Zero de uma plataforma unificada para localizar, comparar e planejar recargas de veículos elétricos.

## Marco atual

- PWA responsiva para desktop e mobile
- 23 pontos reais curados no município de São Paulo
- filtros por potência, corrente e compatibilidade
- estimativa de energia, tempo, custo e autonomia
- indicação de fonte, data de verificação e nível de confiança
- jornada simulada de pagamento e recarga

## Publicação na Vercel

O projeto é estático e não exige build.

- Framework Preset: `Other`
- Root Directory: `.`
- Build Command: vazio
- Output Directory: vazio
- Install Command: vazio

Ao importar este repositório na Vercel, a plataforma publicará o `index.html` da raiz.

## Dados

Os pontos do protótipo usam dados públicos do Open Charge Map. Ausência de tarifa é tratada como informação desconhecida, não como gratuidade.
