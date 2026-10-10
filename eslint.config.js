import { readdirSync } from 'node:fs'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// 기능 폴더 경계 (설계서 4장, 백엔드 ADR-0012와 같은 의존 방향)
// - features 끼리는 서로 import하지 않는다. 공통 코드는 shared로 올린다.
// - 아래에 적은 방향만 예외로 허용한다.
// - 폴더 목록은 src/features에서 읽으므로 기능 폴더를 추가해도 이 파일은 고칠 필요가 없다.
const allowedFeatureImports = {
  gopass: ['billing'],
}

const featureNames = readdirSync('./src/features', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const featureBoundaries = featureNames.map((feature) => {
  const allowed = [feature, ...(allowedFeatureImports[feature] ?? [])]
  const blocked = featureNames.filter((name) => !allowed.includes(name))
  const message = `features/${feature}에서 다른 기능 폴더를 import할 수 없습니다. 공통 코드는 src/shared로 올리세요.`

  const patterns = [{ regex: `^@/features/(?!(?:${allowed.join('|')})(?:/|$))`, message }]
  if (blocked.length > 0) {
    // 상대 경로(../billing/...)로 우회하는 경우
    patterns.push({ regex: `^(?:\.\./)+(?:features/)?(?:${blocked.join('|')})(?:/|$)`, message })
  }

  return {
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': ['error', { patterns }] },
  }
})

const sharedBoundary = {
  files: ['src/shared/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: '^(?:@/|(?:\.\./)+)features(?:/|$)',
            message:
              'shared에서 features를 import할 수 없습니다. 의존 방향은 features → shared 입니다.',
          },
        ],
      },
    ],
  },
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  ...featureBoundaries,
  sharedBoundary,
])
