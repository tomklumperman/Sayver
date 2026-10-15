import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initFirebase } from './src/firebase/config';
import AppNavigator from './src/navigation/AppNavigator';

initFirebase();

export default function App() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<AppNavigator />
		</GestureHandlerRootView>
	);
}
