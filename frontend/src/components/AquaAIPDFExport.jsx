import PropTypes from 'prop-types';
import {
  Document, Page, Text, View, StyleSheet, pdf,
} from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
  },
  cover: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '2px solid #0ea5e9',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandName: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  brandSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  exportMeta: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0ea5e9',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  trendsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  trendCard: {
    flex: 1,
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    padding: 10,
  },
  trendLabel: {
    fontSize: 9,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trendValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 3,
  },
  trendTrend: {
    fontSize: 9,
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    padding: '6 8',
    borderRadius: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    padding: '5 8',
    borderBottom: '1px solid #f1f5f9',
  },
  tableCell: {
    fontSize: 9,
    color: '#1e293b',
    flex: 1,
  },
  tableCellBold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    flex: 1,
  },
  violation: { color: '#dc2626' },
  ok: { color: '#16a34a' },
  messageUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    padding: '8 12',
    marginBottom: 8,
    maxWidth: '70%',
  },
  messageUserText: {
    fontSize: 10,
    color: '#ffffff',
  },
  messageAssistant: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '10 12',
    marginBottom: 12,
  },
  messageAssistantLabel: {
    fontSize: 8,
    color: '#0ea5e9',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 10,
    color: '#334155',
    lineHeight: 1.5,
  },
  listItem: {
    fontSize: 9,
    color: '#475569',
    marginBottom: 3,
    paddingLeft: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: '1px solid #e2e8f0',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#94a3b8',
  },
});

function getTrendColor(trend) {
  if (trend === 'Improving') return '#16a34a';
  if (trend === 'Worsening') return '#dc2626';
  return '#0ea5e9';
}

function getChangeColor(change) {
  if (change === 'Improved') return '#16a34a';
  if (change === 'Worsened') return '#dc2626';
  return '#0ea5e9';
}

function AquaAIPDF({ messages, trends, comparison, yearComparison, stationName, exportDate }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <View style={styles.brandRow}>
            <Text style={styles.brandName}>AquaWatch - AquaAI Report</Text>
          </View>
          <Text style={styles.brandSub}>Water Quality Intelligence Hub · Karnataka, India</Text>
          {stationName && (
            <Text style={[styles.exportMeta, { marginTop: 4 }]}>
              Station: {stationName}
            </Text>
          )}
          <Text style={styles.exportMeta}>Generated: {exportDate}</Text>
          <Text style={styles.exportMeta}>
            Data sources: NWMP Karnataka · Guidelines: WHO 2022, CPCB, BIS IS 10500:2012
          </Text>
        </View>

        {trends && (
          <View>
            <Text style={styles.sectionTitle}>Parameter Trends</Text>
            <View style={styles.trendsGrid}>
              {[
                { key: 'bod_avg', label: 'BOD', unit: 'mg/L' },
                { key: 'fecal_coliform_avg', label: 'Fecal Coliform', unit: 'MPN/100ml' },
                { key: 'do_avg', label: 'DO', unit: 'mg/L' },
                { key: 'nitrate_avg', label: 'Nitrate', unit: 'mg/L' },
              ].map(({ key, label, unit }) => {
                const summary = trends.summary[key];
                if (!summary) return null;
                const color = getTrendColor(summary.trend);
                return (
                  <View key={key} style={styles.trendCard}>
                    <Text style={styles.trendLabel}>{label}</Text>
                    <Text style={styles.trendValue}>{summary.latest} {unit}</Text>
                    <Text style={[styles.trendTrend, { color }]}>{summary.trend}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {comparison && (
          <View>
            <Text style={styles.sectionTitle}>Station Comparison</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellBold, { flex: 1.5 }]}>Parameter</Text>
              <Text style={styles.tableCellBold}>{comparison.station_a.station_name}</Text>
              <Text style={styles.tableCellBold}>{comparison.station_b.station_name}</Text>
              <Text style={styles.tableCellBold}>Limit</Text>
            </View>
            {comparison.parameter_comparison.map((row) => (
              <View key={row.param} style={styles.tableRow}>
                <Text style={[styles.tableCellBold, { flex: 1.5 }]}>{row.label}</Text>
                <Text style={[styles.tableCell, row.a_status === 'violation' ? styles.violation : styles.ok]}>
                  {row.a_value ?? 'N/A'} {row.unit}
                </Text>
                <Text style={[styles.tableCell, row.b_status === 'violation' ? styles.violation : styles.ok]}>
                  {row.b_value ?? 'N/A'} {row.unit}
                </Text>
                <Text style={styles.tableCell}>{row.limit ?? '—'}</Text>
              </View>
            ))}
          </View>
        )}

        {yearComparison && (
          <View>
            <Text style={styles.sectionTitle}>
              Year Comparison: {yearComparison.year_a} vs {yearComparison.year_b}
            </Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellBold, { flex: 1.5 }]}>Parameter</Text>
              <Text style={styles.tableCellBold}>{yearComparison.year_a}</Text>
              <Text style={styles.tableCellBold}>{yearComparison.year_b}</Text>
              <Text style={styles.tableCellBold}>Change</Text>
            </View>
            {yearComparison.parameter_comparison.map((row) => (
              <View key={row.param} style={styles.tableRow}>
                <Text style={[styles.tableCellBold, { flex: 1.5 }]}>{row.label}</Text>
                <Text style={[styles.tableCell, row.a_status === 'violation' ? styles.violation : styles.ok]}>
                  {row.a_value ?? 'N/A'} {row.unit}
                </Text>
                <Text style={[styles.tableCell, row.b_status === 'violation' ? styles.violation : styles.ok]}>
                  {row.b_value ?? 'N/A'} {row.unit}
                </Text>
                <Text style={[styles.tableCell, { color: getChangeColor(row.change) }]}>{row.change}</Text>
              </View>
            ))}
          </View>
        )}

        {messages.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Chat Conversation</Text>
            {messages.map((msg) => {
              const messageKey = `${msg.role}-${msg.content || msg.causes?.[0] || msg.health_risks?.[0] || msg.recommended_actions?.[0] || 'message'}`;
              if (msg.role === 'user') {
                return (
                  <View key={messageKey} style={styles.messageUser}>
                    <Text style={styles.messageUserText}>{msg.content}</Text>
                  </View>
                );
              }

              return (
                <View key={messageKey} style={styles.messageAssistant}>
                  <Text style={styles.messageAssistantLabel}>AquaAI</Text>
                  {msg.violations?.length > 0 && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={[styles.messageText, { fontFamily: 'Helvetica-Bold', marginBottom: 3 }]}>
                        Violations:
                      </Text>
                      {msg.violations.map((violation) => (
                        <Text key={`${violation.parameter}-${violation.value}-${violation.limit}`} style={[styles.listItem, styles.violation]}>
                          • {violation.parameter}: {violation.value} (limit: {violation.limit})
                        </Text>
                      ))}
                    </View>
                  )}
                  {msg.causes?.length > 0 && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={[styles.messageText, { fontFamily: 'Helvetica-Bold', marginBottom: 3 }]}>
                        Causes:
                      </Text>
                      {msg.causes.map((cause) => (
                        <Text key={cause} style={styles.listItem}>• {cause}</Text>
                      ))}
                    </View>
                  )}
                  {msg.health_risks?.length > 0 && (
                    <View style={{ marginBottom: 6 }}>
                      <Text style={[styles.messageText, { fontFamily: 'Helvetica-Bold', marginBottom: 3 }]}>
                        Health Risks:
                      </Text>
                      {msg.health_risks.map((risk) => (
                        <Text key={risk} style={styles.listItem}>• {risk}</Text>
                      ))}
                    </View>
                  )}
                  {msg.recommended_actions?.length > 0 && (
                    <View>
                      <Text style={[styles.messageText, { fontFamily: 'Helvetica-Bold', marginBottom: 3 }]}>
                        Recommended Actions:
                      </Text>
                      {msg.recommended_actions.map((action) => (
                        <Text key={action} style={styles.listItem}>• {action}</Text>
                      ))}
                    </View>
                  )}
                  {!msg.violations?.length && !msg.causes?.length && msg.content && (
                    <Text style={styles.messageText}>{msg.content}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>AquaWatch · AquaAI Report</Text>
          <Text style={styles.footerText}>
            Data: NWMP Karnataka · WHO 2022 · CPCB · BIS IS 10500:2012
          </Text>
        </View>
      </Page>
    </Document>
  );
}

  AquaAIPDF.propTypes = {
    messages: PropTypes.arrayOf(PropTypes.shape({
      role: PropTypes.oneOf(['user', 'assistant']).isRequired,
      content: PropTypes.string,
      violations: PropTypes.arrayOf(PropTypes.shape({
        parameter: PropTypes.string,
        value: PropTypes.string,
        limit: PropTypes.string,
      })),
      causes: PropTypes.arrayOf(PropTypes.string),
      health_risks: PropTypes.arrayOf(PropTypes.string),
      recommended_actions: PropTypes.arrayOf(PropTypes.string),
    })),
    trends: PropTypes.shape({
      summary: PropTypes.object,
    }),
    comparison: PropTypes.shape({
      station_a: PropTypes.shape({
        station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
      }),
      station_b: PropTypes.shape({
        station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
      }),
      parameter_comparison: PropTypes.arrayOf(PropTypes.shape({
        param: PropTypes.string,
        label: PropTypes.string,
        unit: PropTypes.string,
        a_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
        b_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
        limit: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
        a_status: PropTypes.string,
        b_status: PropTypes.string,
      })),
    }),
    yearComparison: PropTypes.shape({
      year_a: PropTypes.number,
      year_b: PropTypes.number,
      parameter_comparison: PropTypes.arrayOf(PropTypes.shape({
        param: PropTypes.string,
        label: PropTypes.string,
        unit: PropTypes.string,
        a_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
        b_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
        a_status: PropTypes.string,
        b_status: PropTypes.string,
        change: PropTypes.string,
      })),
    }),
    stationName: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    exportDate: PropTypes.string.isRequired,
  };

export async function generateAquaAIPDFBlob(props) {
  return pdf(<AquaAIPDF {...props} />).toBlob();
}

export default AquaAIPDF;