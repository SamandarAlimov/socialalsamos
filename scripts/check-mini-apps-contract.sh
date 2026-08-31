#!/usr/bin/env bash
# Mini Apps kontrakti va xavfsizlik qoidalarini tekshiradi.
#
# Ishlatish:  bash scripts/check-mini-apps-contract.sh
# CI da:      docs/contracts/mini-apps/ci.md dagi workflow ichida chaqiriladi.

set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

echo "1) Shartnoma fayllari"
for file in \
  docs/contracts/mini-apps/CONTRACT_VERSION \
  docs/contracts/mini-apps/README.md \
  docs/contracts/mini-apps/open-strategy.md \
  docs/contracts/mini-apps/mini-app-manifest.schema.json; do
  test -f "$file" || fail "$file topilmadi"
done

version=$(tr -d '[:space:]' < docs/contracts/mini-apps/CONTRACT_VERSION)
echo "   kontrakt versiyasi: $version"
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || fail "CONTRACT_VERSION semver formatida bo'lishi kerak"

echo "2) Manifest schema sintaksisi"
node -e "JSON.parse(require('fs').readFileSync('docs/contracts/mini-apps/mini-app-manifest.schema.json','utf8'))" \
  || fail "manifest schema JSON sifatida o'qilmadi"

echo "3) Kod versiyasi kontrakt bilan mos"
grep -q "MINI_APP_CONTRACT_VERSION = '$version'" src/features/miniapps/types.ts \
  || fail "types.ts dagi MINI_APP_CONTRACT_VERSION $version ga teng bo'lishi kerak"

echo "4) Sandbox qoidasi (allow-same-origin taqiqlangan)"
if grep -rn "allow-same-origin" src/features/miniapps src/pages/MiniAppsPage.tsx; then
  fail "allow-scripts bilan birga allow-same-origin berilishi mumkin emas (sandbox escape)"
fi
grep -q "allow-popups-to-escape-sandbox" src/features/miniapps/openStrategy.ts \
  || fail "majburiy sandbox qatori o'zgargan"

echo "5) Timeout qiymatlari"
grep -q "DIRECT_TIMEOUT_MS = 8000" src/features/miniapps/openStrategy.ts \
  || fail "direct timeout 8000 ms bo'lishi kerak"
grep -q "PROXY_TIMEOUT_MS = 15000" src/features/miniapps/openStrategy.ts \
  || fail "proxy timeout 15000 ms bo'lishi kerak"

echo "6) Klientda ranking qilinmasligi"
if grep -rn "select('\*')" src/features/miniapps; then
  fail "mini app ma'lumotlari faqat mini_apps_feed RPC orqali olinadi"
fi

echo "7) Kategoriyalar xardkod qilinmaganligi"
if grep -rn "const MINI_APP_CATEGORIES" src/features/miniapps; then
  fail "kategoriyalar faqat mini_app_categories jadvalidan olinadi"
fi

echo
echo "Barcha kontrakt tekshiruvlari muvaffaqiyatli o'tdi."
