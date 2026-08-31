# CI: kontrakt tekshiruvi

Ikkala repo ham `CONTRACT_VERSION` ni bir xil ushlab turishi kerak. Tekshiruv skriptlari:

- web: `bash scripts/check-mini-apps-contract.sh`
- Flutter: `bash scripts/check_mini_apps_contract.sh`

## socialalsamos uchun workflow

`.github/workflows/mini-apps-contract.yml` faylini quyidagicha yarating
(workflow fayllarini bot yozolmaydi — bir marta qo'lda qo'shiladi):

```yaml
name: mini-apps-contract

on:
  push:
    branches: [main]
    paths:
      - 'docs/contracts/mini-apps/**'
      - 'src/features/miniapps/**'
      - 'src/pages/MiniAppsPage.tsx'
      - 'scripts/check-mini-apps-contract.sh'
  pull_request:
    paths:
      - 'docs/contracts/mini-apps/**'
      - 'src/features/miniapps/**'
      - 'src/pages/MiniAppsPage.tsx'
      - 'scripts/check-mini-apps-contract.sh'

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: bash scripts/check-mini-apps-contract.sh
      - run: npm ci || npm install
      - run: npx vitest run src/features/miniapps
```

## alsamos-superapp uchun workflow

```yaml
name: mini-apps-contract

on:
  push:
    branches: [main]
    paths:
      - 'docs/contracts/mini-apps/**'
      - 'lib/features/miniapps/**'
      - 'test/features/miniapps/**'
  pull_request:
    paths:
      - 'docs/contracts/mini-apps/**'
      - 'lib/features/miniapps/**'
      - 'test/features/miniapps/**'

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bash scripts/check_mini_apps_contract.sh
      - uses: subosito/flutter-action@v2
        with:
          channel: stable
          cache: true
      - run: flutter pub get
      - run: flutter test test/features/miniapps
      - run: |
          flutter analyze \
            lib/features/miniapps/domain \
            lib/features/miniapps/data/mini_app_feed_item.dart \
            lib/features/miniapps/data/mini_apps_feed_repository.dart \
            lib/features/miniapps/presentation/providers/mini_apps_feed_provider.dart
```

## Versiyani ko'tarish tartibi

1. `socialalsamos/docs/contracts/mini-apps/` da o'zgartirish + `CONTRACT_VERSION` ni ko'tarish.
2. `src/features/miniapps/types.ts` dagi `MINI_APP_CONTRACT_VERSION` ni yangilash.
3. Aynan shu papkani `alsamos-superapp` ga ko'chirish.
4. Ikkala repoda CI yashil bo'lgandan keyin merge qilish.
