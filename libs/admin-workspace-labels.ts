import en from '../public/locales/en/admin-workspace.json';
import kr from '../public/locales/kr/admin-workspace.json';
import ru from '../public/locales/ru/admin-workspace.json';

// Shared headers also render on pages without Admin translation props.
// Follow the existing Admin navigation's locale-JSON pattern, including during SSR.
export function adminWorkspaceLabels(locale?: string) {
	return locale === 'kr' ? kr : locale === 'ru' ? ru : en;
}
