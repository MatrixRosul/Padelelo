import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { PlayerProfileResponse } from '../hooks/usePlayerProfile';
import { Colors } from '../theme/colors';

type MatchMember = {
  id: string;
  fullName: string;
  nickname: string | null;
};

type MatchHistoryEntry = PlayerProfileResponse['matchHistory'][number];

type ChartPoint = {
  key: string;
  matchCount: number;
  rating: number;
  x: number;
  y: number;
};

function normalizeHumanName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s+/, '');

  if (!normalized) {
    return null;
  }

  if (/^csv-[a-f0-9]{12,}$/i.test(normalized)) {
    return null;
  }

  if (/^[a-f0-9]{16,}$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function displayPlayerName(member: MatchMember): string {
  return normalizeHumanName(member.fullName) || normalizeHumanName(member.nickname) || 'Player';
}

function initials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'P';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function formatSetScores(
  setScores: Array<{
    setNumber: number;
    teamAScore: number;
    teamBScore: number;
  }>,
): string {
  if (setScores.length === 0) {
    return '-';
  }

  return setScores
    .map((setScore) => `${setScore.teamAScore}-${setScore.teamBScore}`)
    .join(', ');
}

function resolveOutcomeToken(match: MatchHistoryEntry, playerId: string): 'W' | 'L' | 'D' {
  const ownTeam = match.teams.find(
    (team) => team.player1.id === playerId || team.player2.id === playerId,
  );

  if (!ownTeam || !match.winnerTeamSide) {
    return 'D';
  }

  return ownTeam.side === match.winnerTeamSide ? 'W' : 'L';
}

export function PlayerProfileSummary({ profile }: { profile: PlayerProfileResponse }) {
  const { width: windowWidth } = useWindowDimensions();

  const chartModel = useMemo(() => {
    if (profile.eloHistory.length === 0) {
      return null;
    }

    const history = [...profile.eloHistory].reverse();

    const rawPoints = [
      {
        key: `start-${history[0].id}`,
        matchCount: 0,
        rating: history[0].beforeRating,
      },
      ...history.map((entry, index) => ({
        key: entry.id,
        matchCount: index + 1,
        rating: entry.afterRating,
      })),
    ];

    const ratings = rawPoints.map((point) => point.rating);
    const minRaw = Math.min(...ratings);
    const maxRaw = Math.max(...ratings);
    const spread = Math.max(1, maxRaw - minRaw);
    const yPadding = Math.max(10, Math.round(spread * 0.12));
    const yMin = minRaw - yPadding;
    const yMax = maxRaw + yPadding;
    const yRange = Math.max(1, yMax - yMin);

    const chartWidth = Math.max(280, Math.min(windowWidth - 72, 460));
    const chartHeight = 230;

    const padding = {
      top: 18,
      right: 16,
      bottom: 34,
      left: 48,
    };

    const plotWidth = chartWidth - padding.left - padding.right;
    const plotHeight = chartHeight - padding.top - padding.bottom;
    const maxMatches = rawPoints[rawPoints.length - 1]?.matchCount ?? 0;

    const scaleX = (matchCount: number): number => {
      if (maxMatches === 0) {
        return padding.left;
      }

      return padding.left + (matchCount / maxMatches) * plotWidth;
    };

    const scaleY = (rating: number): number => {
      return padding.top + ((yMax - rating) / yRange) * plotHeight;
    };

    const points: ChartPoint[] = rawPoints.map((point) => ({
      ...point,
      x: scaleX(point.matchCount),
      y: scaleY(point.rating),
    }));

    const linePath = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ');

    const baselineY = padding.top + plotHeight;
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${points[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`;

    const yTickRaw = Array.from({ length: 5 }, (_, index) =>
      Math.round(yMax - (index * yRange) / 4),
    );
    const yTicks = Array.from(new Set(yTickRaw));

    const xTickRaw = [0, Math.round(maxMatches / 2), maxMatches];
    const xTicks = Array.from(new Set(xTickRaw)).sort((a, b) => a - b);

    let peakPoint = points[0];
    for (const point of points) {
      if (point.rating > peakPoint.rating) {
        peakPoint = point;
      }
    }

    const highlightPointIndexes = Array.from(
      new Set([
        0,
        points.length - 1,
        points.findIndex((point) => point.key === peakPoint.key),
        Math.floor((points.length - 1) / 2),
      ]),
    ).filter((index) => index >= 0 && index < points.length);

    return {
      chartWidth,
      chartHeight,
      padding,
      plotHeight,
      plotWidth,
      scaleX,
      scaleY,
      linePath,
      areaPath,
      yTicks,
      xTicks,
      points,
      peakPoint,
      maxMatches,
      highlightPointIndexes,
    };
  }, [profile.eloHistory, windowWidth]);

  const peakRating = chartModel?.peakPoint.rating ?? profile.currentElo;
  const peakAtMatch = chartModel?.peakPoint.matchCount ?? profile.matchesPlayed;
  const bestGain = profile.eloHistory.length > 0 ? Math.max(...profile.eloHistory.map((entry) => entry.delta)) : 0;
  const worstDrop = profile.eloHistory.length > 0 ? Math.min(...profile.eloHistory.map((entry) => entry.delta)) : 0;

  const recordStats = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let draws = 0;

    for (const match of profile.matchHistory) {
      const isCompleted = Boolean(match.playedAt) || match.setScores.length > 0 || Boolean(match.winnerTeamSide);
      if (!isCompleted) {
        continue;
      }

      const outcome = resolveOutcomeToken(match, profile.id);
      if (outcome === 'W') {
        wins += 1;
      } else if (outcome === 'L') {
        losses += 1;
      } else {
        draws += 1;
      }
    }

    const hasHistoryRecord = wins + losses + draws > 0;
    if (!hasHistoryRecord) {
      const fallbackDraws = Math.max(profile.matchesPlayed - profile.wins - profile.losses, 0);

      return {
        wins: profile.wins,
        losses: profile.losses,
        draws: fallbackDraws,
        matches: profile.matchesPlayed,
      };
    }

    return {
      wins,
      losses,
      draws,
      matches: wins + losses + draws,
    };
  }, [profile.id, profile.losses, profile.matchHistory, profile.matchesPlayed, profile.wins]);

  const winRate = recordStats.matches > 0 ? Math.round((recordStats.wins / recordStats.matches) * 100) : 0;

  const formTokens = profile.matchHistory
    .slice(0, 5)
    .map((match) => resolveOutcomeToken(match, profile.id));

  const deltaByMatchId = useMemo(() => {
    const map = new Map<string, number>();

    for (const entry of profile.eloHistory) {
      if (!entry.matchId || map.has(entry.matchId)) {
        continue;
      }

      map.set(entry.matchId, entry.delta);
    }

    return map;
  }, [profile.eloHistory]);

  const playerName = normalizeHumanName(profile.displayName) || normalizeHumanName(profile.fullName) || 'Player';

  return (
    <View style={styles.container}>
      <View style={styles.heroCard}>
        <View style={styles.heroGlow} />

        <View style={styles.heroTopRow}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{initials(playerName)}</Text>
          </View>

          <View style={styles.heroTitleWrap}>
            <Text style={styles.heroLabel}>Player Profile</Text>
            <Text style={styles.heroTitle}>{playerName}</Text>
            <Text style={styles.heroSubtitle}>Performance overview</Text>
          </View>

          <View style={styles.heroEloBadge}>
            <Text style={styles.heroEloLabel}>Elo Rating</Text>
            <Text style={styles.heroEloValue}>{profile.currentElo}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Win Rate</Text>
          <Text style={styles.statValue}>{winRate}%</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>W/D/L</Text>
          <Text style={styles.statValue}>{recordStats.wins}/{recordStats.draws}/{recordStats.losses}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Matches</Text>
          <Text style={styles.statValue}>{recordStats.matches}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ELO Timeline</Text>
        {chartModel ? (
          <View style={styles.chartCard}>
            <Text style={styles.chartAxisHint}>Y: Rating</Text>
            <Svg height={chartModel.chartHeight} width={chartModel.chartWidth}>
              {chartModel.yTicks.map((tick) => {
                const y = chartModel.scaleY(tick);

                return (
                  <G key={`y-${tick}`}>
                    <Line
                      stroke={Colors.outlineVariant}
                      strokeDasharray={[4, 4]}
                      strokeWidth={1}
                      x1={chartModel.padding.left}
                      x2={chartModel.padding.left + chartModel.plotWidth}
                      y1={y}
                      y2={y}
                    />
                    <SvgText
                      fill={Colors.textSecondary}
                      fontSize="10"
                      textAnchor="end"
                      x={chartModel.padding.left - 8}
                      y={y + 3}
                    >
                      {tick}
                    </SvgText>
                  </G>
                );
              })}

              {chartModel.xTicks.map((tick) => {
                const x = chartModel.scaleX(tick);

                return (
                  <G key={`x-${tick}`}>
                    <Line
                      stroke={Colors.outlineVariant}
                      strokeDasharray={[3, 5]}
                      strokeWidth={1}
                      x1={x}
                      x2={x}
                      y1={chartModel.padding.top}
                      y2={chartModel.padding.top + chartModel.plotHeight}
                    />
                    <SvgText
                      fill={Colors.textSecondary}
                      fontSize="10"
                      textAnchor="middle"
                      x={x}
                      y={chartModel.padding.top + chartModel.plotHeight + 16}
                    >
                      {tick}
                    </SvgText>
                  </G>
                );
              })}

              <Line
                stroke={Colors.outline}
                strokeWidth={1.3}
                x1={chartModel.padding.left}
                x2={chartModel.padding.left}
                y1={chartModel.padding.top}
                y2={chartModel.padding.top + chartModel.plotHeight}
              />
              <Line
                stroke={Colors.outline}
                strokeWidth={1.3}
                x1={chartModel.padding.left}
                x2={chartModel.padding.left + chartModel.plotWidth}
                y1={chartModel.padding.top + chartModel.plotHeight}
                y2={chartModel.padding.top + chartModel.plotHeight}
              />

              <Path d={chartModel.areaPath} fill="rgba(0, 55, 111, 0.12)" />
              <Path d={chartModel.linePath} fill="none" stroke={Colors.primary} strokeWidth={3} />

              {chartModel.points.map((point, index) => {
                const isHighlighted = chartModel.highlightPointIndexes.includes(index);

                return (
                  <G key={point.key}>
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      fill={isHighlighted ? Colors.secondary : Colors.surfaceLowest}
                      r={isHighlighted ? 4.5 : 3.2}
                      stroke={Colors.primary}
                      strokeWidth={isHighlighted ? 2 : 1.5}
                    />

                    {isHighlighted ? (
                      <SvgText
                        fill={Colors.textPrimary}
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle"
                        x={point.x}
                        y={point.y - 10}
                      >
                        {point.rating}
                      </SvgText>
                    ) : null}
                  </G>
                );
              })}
            </Svg>
            <Text style={styles.chartAxisHintBottom}>X: Matches played</Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>No rating history yet.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Insights</Text>
        <View style={styles.insightsGrid}>
          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>Peak Rating</Text>
            <Text style={styles.insightValue}>{peakRating}</Text>
            <Text style={styles.insightHint}>Match #{peakAtMatch}</Text>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>Best Gain</Text>
            <Text style={[styles.insightValue, styles.positiveText]}>{bestGain >= 0 ? `+${bestGain}` : bestGain}</Text>
            <Text style={styles.insightHint}>Single match delta</Text>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>Worst Drop</Text>
            <Text style={[styles.insightValue, styles.negativeText]}>{worstDrop}</Text>
            <Text style={styles.insightHint}>Single match delta</Text>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>Recent Form</Text>
            {formTokens.length > 0 ? (
              <View style={styles.formRow}>
                {formTokens.map((token, index) => (
                  <View
                    key={`${token}-${index}`}
                    style={[
                      styles.formToken,
                      token === 'W' ? styles.formTokenWin : token === 'L' ? styles.formTokenLoss : styles.formTokenDraw,
                    ]}
                  >
                    <Text style={styles.formTokenText}>{token}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.insightValue}>-</Text>
            )}
            <Text style={styles.insightHint}>Last {formTokens.length} matches</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Matches</Text>
        {profile.matchHistory.slice(0, 10).map((match) => {
          const teamA = match.teams.find((team) => team.side === 'A');
          const teamB = match.teams.find((team) => team.side === 'B');
          const ratingDelta = deltaByMatchId.get(match.id);

          const teamATitle = teamA
            ? `${displayPlayerName(teamA.player1)} / ${displayPlayerName(teamA.player2)}`
            : 'Team A';
          const teamBTitle = teamB
            ? `${displayPlayerName(teamB.player1)} / ${displayPlayerName(teamB.player2)}`
            : 'Team B';

          return (
            <View key={match.id} style={styles.matchCard}>
              <Text style={styles.matchLeague}>{match.tournamentCategory?.name || 'League'}</Text>
              <Text style={styles.matchTeams}>{teamATitle}</Text>
              <Text style={styles.matchTeams}>vs</Text>
              <Text style={styles.matchTeams}>{teamBTitle}</Text>

              <View style={styles.matchScoreRow}>
                <Text style={styles.matchScore}>{formatSetScores(match.setScores)}</Text>

                {typeof ratingDelta === 'number' ? (
                  <View
                    style={[
                      styles.matchDeltaPill,
                      ratingDelta >= 0 ? styles.matchDeltaPillPositive : styles.matchDeltaPillNegative,
                    ]}
                  >
                    <Text
                      style={[
                        styles.matchDeltaText,
                        ratingDelta >= 0 ? styles.matchDeltaTextPositive : styles.matchDeltaTextNegative,
                      ]}
                    >
                      {ratingDelta >= 0 ? `↑ +${ratingDelta}` : `↓ ${ratingDelta}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chartAxisHint: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  chartAxisHintBottom: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  chartCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 12,
    padding: 10,
  },
  container: {
    gap: 14,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  formToken: {
    alignItems: 'center',
    borderRadius: 999,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  formTokenDraw: {
    backgroundColor: Colors.outlineVariant,
  },
  formTokenLoss: {
    backgroundColor: 'rgba(186, 26, 26, 0.14)',
  },
  formTokenText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  formTokenWin: {
    backgroundColor: 'rgba(0, 88, 82, 0.14)',
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    overflow: 'hidden',
    padding: 16,
  },
  heroAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 18,
    height: 70,
    justifyContent: 'center',
    width: 70,
  },
  heroAvatarText: {
    color: Colors.onPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  heroEloBadge: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 14,
    minWidth: 96,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  heroEloLabel: {
    color: Colors.onSecondaryContainer,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  heroEloValue: {
    color: Colors.onSecondaryContainer,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.3,
    lineHeight: 27,
  },
  heroGlow: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 999,
    height: 200,
    opacity: 0.4,
    position: 'absolute',
    right: -68,
    top: -82,
    width: 200,
  },
  heroLabel: {
    color: Colors.onPrimaryContainer,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: Colors.onPrimaryContainer,
    fontSize: 12,
    marginTop: 2,
  },
  heroTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  heroTitle: {
    color: Colors.onPrimary,
    fontSize: 34,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.7,
    lineHeight: 36,
    textTransform: 'uppercase',
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  insightCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 12,
    flexBasis: '48%',
    gap: 3,
    minHeight: 92,
    padding: 10,
  },
  insightHint: {
    color: Colors.outline,
    fontSize: 10,
    fontWeight: '700',
  },
  insightLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  insightValue: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  insightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  matchCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 12,
    gap: 2,
    padding: 10,
  },
  matchLeague: {
    color: Colors.secondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  matchScore: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  matchScoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  matchDeltaPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  matchDeltaPillPositive: {
    backgroundColor: 'rgba(0, 88, 82, 0.14)',
  },
  matchDeltaPillNegative: {
    backgroundColor: 'rgba(186, 26, 26, 0.14)',
  },
  matchDeltaText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  matchDeltaTextPositive: {
    color: Colors.success,
  },
  matchDeltaTextNegative: {
    color: Colors.error,
  },
  matchTeams: {
    color: Colors.textPrimary,
    fontSize: 12,
  },
  negativeText: {
    color: Colors.error,
  },
  positiveText: {
    color: Colors.tertiary,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  statCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 16,
    flex: 1,
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: {
    color: Colors.primary,
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 29,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
});
