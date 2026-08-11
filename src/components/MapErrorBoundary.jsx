import { Component } from 'react'

/**
 * 지도에서 난 예외가 보드 전체를 무너뜨리지 않게 막는 울타리.
 *
 * 외부 지도 스크립트(네이버)는 우리가 통제할 수 없고, 인증이 실패하면 반쯤 죽은
 * 객체를 남기기도 한다. 그때 정리 과정에서 던진 예외가 그대로 올라가면 React가
 * 트리 전체를 내려서 **화면이 하얗게** 된다. 지도는 부가 기능이므로, 무슨 일이
 * 있어도 카드 목록은 살아 있어야 한다.
 */
export default class MapErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('지도 렌더링 실패:', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="mb-6 rounded-2xl bg-white px-4 py-3 text-center text-sm text-neutral-500 shadow-sm ring-1 ring-neutral-900/5">
          🗺️ 지도를 표시할 수 없어요. 카드 목록은 그대로 사용할 수 있습니다.
        </p>
      )
    }
    return this.props.children
  }
}
