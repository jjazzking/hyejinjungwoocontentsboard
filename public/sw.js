/**
 * 서비스 워커 — **일부러 아무 일도 하지 않는다.**
 *
 * 있는 이유는 하나뿐이다: 브라우저가 이 사이트를 '설치 가능한 앱'으로 취급하려면
 * fetch 핸들러를 가진 서비스 워커가 있어야 하고, 설치가 돼야 인스타 공유 시트에
 * 우리 보드가 뜬다 (manifest의 share_target).
 *
 * 캐싱은 일부러 넣지 않았다. 카드 데이터는 어차피 Supabase에 있어서 오프라인으로
 * 얻는 게 거의 없는 반면, 캐시를 깔면 배포한 뒤에도 옛날 화면이 남는 문제가 생긴다.
 * 그래서 요청은 전부 그냥 네트워크로 흘려보낸다.
 */

// 새 버전이 배포되면 기다리지 않고 바로 교체한다
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 핸들러가 '있다'는 사실만 필요하다 — respondWith를 부르지 않으면 브라우저가 알아서 가져온다
self.addEventListener('fetch', () => {})
