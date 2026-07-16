Goalie Tracker Pro v1.0

적용 방법:
1. 압축을 풉니다.
2. 이번 버전은 폴더 안의 모든 파일을 사용합니다.
3. 기존 GoalieTracker 폴더에 아래 파일과 폴더를 모두 덮어씁니다.
   - index.html
   - style.css
   - app.js
   - manifest.json
   - sw.js
   - icons 폴더
4. VS Code에서 index.html 우클릭 → Open with Live Server.

v1.0 추가 기능:
- PWA 앱 설치
- 뮤패드 홈 화면 아이콘
- 주소창 없는 단독 앱 화면
- 서비스 워커 오프라인 캐시
- 온라인/오프라인 상태 표시
- 앱 설치 버튼 및 수동 설치 안내
- Wi-Fi를 끈 뒤에도 앱 실행 및 기록 가능
- 앱 아이콘 192px, 512px, maskable 아이콘 포함

중요:
- PWA는 최초 1회 설치할 때 HTTPS 주소 또는 localhost/개발 서버로 열어야 합니다.
- PC의 Live Server 화면을 태블릿에 파일만 복사해 file://로 열면 PWA 설치가 되지 않습니다.
- 가장 쉬운 배포 방법은 GitHub Pages 같은 HTTPS 주소에 올린 뒤 뮤패드 Chrome에서 1회 설치하는 것입니다.
- 설치가 끝난 뒤에는 인터넷 없이 사용할 수 있습니다.
- 기록 데이터는 각 태블릿 내부 저장소에 저장되므로 백업 기능을 주기적으로 사용하세요.
