# 유튜브 기획 검수실

기획안을 입력하면 키워드 기회도, 제목, 썸네일 방향, 설명문, 태그, 구성 및 위험 요소를 한 번에 검수하는 웹앱 MVP입니다.

## 처음 실행하는 방법 — Windows

Node.js 20 이상이 필요합니다. 명령 프롬프트에서 `node --version`을 입력했을 때 버전 번호가 나오면 설치되어 있는 상태입니다.

### 1. 압축 풀기

`youtube-planner-audit-mvp.zip` 파일을 마우스 오른쪽 버튼으로 누르고 **모두 압축 풀기**를 선택합니다.

압축을 푼 폴더 안에 다음 파일이 보이면 정상입니다.

- `package.json`
- `server.mjs`
- `README.md`
- `public` 폴더

### 2. 명령 프롬프트 열기

Windows 시작 메뉴에서 `cmd` 또는 `명령 프롬프트`를 검색해 실행합니다.

### 3. `cd` 명령으로 프로젝트 폴더 들어가기

현재 제공된 폴더를 그대로 사용한다면 아래 명령을 복사해 입력합니다.

```bat
cd /d "C:\Users\USER\Documents\Codex\2026-06-22\d\outputs\youtube-planner-audit-mvp"
```

다른 위치에 압축을 풀었다면 따옴표 안의 경로를 실제 압축 해제 폴더 경로로 바꿉니다. 명령줄 왼쪽 경로의 마지막이 `youtube-planner-audit-mvp>`로 바뀌면 정상입니다.

팁: 파일 탐색기에서 압축 해제 폴더를 연 다음, 상단 주소창에 `cmd`를 입력하고 Enter를 눌러도 해당 폴더에서 바로 명령 프롬프트가 열립니다.

### 4. 환경설정 파일 만들기

처음 한 번만 아래 명령을 입력합니다.

```bat
copy .env.example .env
notepad .env
```

메모장이 열리면 발급받은 키를 입력하고 저장합니다. 키 앞뒤에 따옴표는 넣지 않습니다.

```env
GEMINI_API_KEY=발급받은_제미나이_API_키
GEMINI_MODEL=gemini-3.5-flash
YOUTUBE_API_KEY=발급받은_유튜브_API_키
```

API 키가 없어도 실행할 수 있지만, 그 경우 단순한 데모 분석 결과가 나옵니다.

### 5. 프로그램 실행하기

같은 명령 프롬프트에서 아래 명령을 입력합니다.

```bat
npm.cmd start
```

다음 문구가 표시되면 실행에 성공한 것입니다.

```text
유튜브 기획 검수실: http://localhost:4173
```

브라우저에서 [http://localhost:4173](http://localhost:4173)을 엽니다. 프로그램을 사용하는 동안 명령 프롬프트 창을 닫지 마세요.

### 화면의 주요 설정

- **영상 형식**: 정보형, 브이로그, 리뷰, 튜토리얼, 인터뷰 중 콘텐츠 전개 방식을 선택합니다.
- **영상 길이**: 롱폼 또는 숏폼을 선택합니다. 숏폼은 첫 1초 훅과 60초 이내 구성으로, 롱폼은 첫 15초 훅과 챕터 구성으로 분석됩니다.
- **핵심 검색어**: 비워두면 AI가 기획안에서 실제 검색 주제만 판단합니다. 검색 결과가 엉뚱할 때는 `지게차 옵션`처럼 직접 입력해 자동 판단을 덮어쓸 수 있습니다.
- **AI 엔진**: 자동 선택, Gemini, GPT 중 선택합니다. API 키가 없는 엔진은 화면에서 `키 없음`으로 표시되고 선택할 수 없습니다.

분석 결과 상단에는 실제 사용된 AI 엔진과 YouTube 데이터 사용 여부가 표시됩니다.
YouTube 상위 결과의 영상 제목을 클릭하면 해당 영상을 새 탭에서 열 수 있습니다.
상위 결과는 핵심 검색어로 YouTube 관련도 상위 10개를 조회한 뒤, 조회수 순으로 정렬한 5개 영상입니다.
상위 결과 영역의 검색창에서 검색어만 바꾸면 전체 기획안을 다시 분석하지 않고 YouTube 경쟁 데이터와 상위 영상만 즉시 갱신할 수 있습니다.

썸네일 방향에는 YouTube 상위 영상의 실제 썸네일을 레퍼런스로 표시합니다. 추가 API 호출 없이 기존 검색 데이터를 사용하며, 구도와 문구 참고용으로만 사용하고 이미지를 복제하지 않습니다.

제목 후보 점수는 핵심 키워드 적합도, 구체성, 클릭 호기심 및 과장 위험을 종합한 AI 상대점수이며 각 제목 아래에 이유가 표시됩니다. 키워드 기회점수는 `수요 × 62% + (100 - 경쟁) × 38%`로 계산됩니다.

동일한 지역과 검색어의 YouTube 결과는 6시간 동안 캐시됩니다. 같은 브라우저에서는 API를 다시 호출하지 않고 결과를 재사용하며, 로컬 서버 또는 동일한 Vercel 실행 인스턴스에서도 캐시를 재사용합니다. Vercel 실행 인스턴스가 교체되면 서버 캐시는 초기화될 수 있습니다.

AI가 설명문에 `\n` 형태로 반환한 줄바꿈 문자는 화면에서 실제 줄바꿈으로 자동 변환됩니다.

원본 기획안, 사용한 AI, 영상 형식, 검색 주제 및 참고한 YouTube 영상을 작업 기록으로 남깁니다. 결과 화면의 **전체 보고서 저장**을 누른 뒤 인쇄 창에서 **PDF로 저장**을 선택하면 팀장이나 다른 작업자에게 전체 검수 과정을 공유할 수 있습니다.

썸네일 영역의 그림은 실제로 생성된 이미지가 아니라 문구와 배치 방향을 보여주는 무료 레이아웃 예시입니다.

### 6. 프로그램 종료 및 다시 실행

종료할 때는 실행 중인 명령 프롬프트에서 `Ctrl+C`를 누릅니다.

다음에 다시 실행할 때는 아래 두 명령만 입력하면 됩니다.

```bat
cd /d "C:\Users\USER\Documents\Codex\2026-06-22\d\outputs\youtube-planner-audit-mvp"
npm.cmd start
```

`EADDRINUSE` 오류가 나오면 이미 프로그램이 실행 중이라는 뜻입니다. 열려 있는 기존 명령 프롬프트를 확인하거나 브라우저에서 `http://localhost:4173`을 새로고침하세요.

## 실제 AI·YouTube 데이터 연결

위 4단계에서 만든 `.env` 파일에 필요한 키를 입력합니다.

- `GEMINI_API_KEY`: 무료 등급으로 기획안 분석과 문구 생성(우선 사용)
- `GEMINI_MODEL`: 기본값 `gemini-3.5-flash`
- `OPENAI_API_KEY`: Gemini 키가 없을 때 사용할 선택 항목
- `YOUTUBE_API_KEY`: 검색 상위 영상과 경쟁 강도 조사
- `OPENAI_MODEL`: 기본값 `gpt-5.5`

Google Trends API는 현재 제한적 알파이므로 이번 MVP에는 직접 호출 대신 연결 상태와 확장 지점만 마련했습니다. Google Ads 키워드 플래너 연동은 OAuth 및 광고 계정 설정이 필요해 다음 단계에서 추가할 수 있습니다.

API 키는 브라우저로 전달되지 않고 서버에서만 읽습니다.

## 팀원과 공유하기 — GitHub + Vercel

이 프로젝트는 Supabase나 데이터베이스 없이 GitHub와 Vercel만으로 공유할 수 있습니다. 로컬 실행 방식도 그대로 유지됩니다.

### 1. GitHub 비공개 저장소 만들기

GitHub에서 새 저장소를 만들고 공개 범위를 **Private**로 설정합니다. 저장소를 만든 뒤 프로젝트 폴더의 명령 프롬프트에서 아래 명령을 실행합니다.

```bat
git init
git branch -M main
git add .
git commit -m "유튜브 기획 검수실 최초 배포"
git remote add origin https://github.com/GITHUB사용자명/저장소이름.git
git push -u origin main
```

마지막 두 명령의 주소는 실제 GitHub 저장소 주소로 바꿉니다. `.env` 파일은 `.gitignore`에 포함되어 있어 API 키가 GitHub에 올라가지 않습니다.

### 2. Vercel에 GitHub 저장소 연결하기

1. [Vercel](https://vercel.com)에 로그인합니다.
2. **Add New → Project**를 선택합니다.
3. 방금 만든 GitHub 비공개 저장소를 Import합니다.
4. Framework Preset은 **Other**로 둡니다.
5. 별도 Build Command와 Output Directory는 입력하지 않습니다.

### 3. Vercel 환경변수 입력하기

Vercel 프로젝트의 **Settings → Environment Variables**에서 아래 값을 추가합니다.

```text
GEMINI_API_KEY       발급받은 Gemini API 키
GEMINI_MODEL         gemini-3.5-flash
YOUTUBE_API_KEY      발급받은 YouTube API 키
OPENAI_API_KEY       선택 사항
OPENAI_MODEL         gpt-5.5
```

`OPENAI_API_KEY`가 없다면 입력하지 않아도 됩니다. `PORT`는 Vercel에서 자동 관리하므로 입력하지 않습니다.

### 4. 배포 및 공유

**Deploy**를 누른 뒤 생성된 `https://프로젝트이름.vercel.app` 주소를 팀원에게 공유합니다. 이후 GitHub의 `main` 브랜치에 코드를 올리면 Vercel이 자동으로 다시 배포합니다.

로그인을 적용하지 않은 URL이므로 주소를 아는 사람은 API를 사용할 수 있습니다. 링크를 외부에 공개하지 말고 Gemini·YouTube 사용량을 주기적으로 확인하세요.
