import { useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { PATHS } from './paths';
import screen from './Screen.module.css';

export function NotFoundRoute() {
  const navigate = useNavigate();
  return (
    <main className={screen.screen}>
      <div className={screen.centered}>
        <p className="u-eyebrow">길 잃은 자리</p>
        <p className="u-title">이 좌표에는 아무것도 없습니다</p>
        <Button variant="ghost" onClick={() => navigate(PATHS.home)}>
          처음으로 돌아가기
        </Button>
      </div>
    </main>
  );
}
