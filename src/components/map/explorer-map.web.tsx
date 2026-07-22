import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Mask, Path, Rect } from 'react-native-svg';

import { TrackPoint } from '@/domain/types';
import { colors } from '@/theme/tokens';

export function ExplorerMap({ route }: { route: TrackPoint[] }) {
  const path = route.length
    ? route.map((_, index) => `${index === 0 ? 'M' : 'L'} ${120 + index * 58} ${330 - index * 42}`).join(' ')
    : 'M 120 330 L 178 288 L 236 246 L 294 204 L 352 162';

  return (
    <View style={styles.container}>
      <Svg height="100%" viewBox="0 0 480 640" width="100%">
        <Rect fill="#132431" height="640" width="480" />
        <G opacity={0.52}>
          {[70, 140, 210, 280, 350, 420].map((x) => <Line key={`v-${x}`} stroke="#294153" strokeWidth="9" x1={x} x2={x + 40} y1="0" y2="640" />)}
          {[80, 170, 260, 350, 440, 530].map((y) => <Line key={`h-${y}`} stroke="#294153" strokeWidth="7" x1="0" x2="480" y1={y} y2={y + 25} />)}
        </G>
        <Defs>
          <Mask id="fog-mask">
            <Rect fill="white" height="640" width="480" />
            <Path d={path} fill="none" stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="58" />
          </Mask>
        </Defs>
        <Rect fill="#050B10" fillOpacity={0.84} height="640" mask="url(#fog-mask)" width="480" />
        <Path d={path} fill="none" stroke={colors.brand} strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
        <Circle cx="352" cy="162" fill={colors.brand} r="10" stroke="#F5F7F4" strokeWidth="4" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background } });
