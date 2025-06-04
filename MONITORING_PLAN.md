# Monitoring Plan for Limitless AI MCP Server

> 📊 **Purpose**: This document outlines a comprehensive plan for monitoring new lifelog data arrivals, generating automated summaries, and implementing notification systems.

## Current State Analysis

### Background Sync Status

- **Sync Service**: Implemented in `src/vector-store/sync-service.ts`
- **Default Interval**: 60 seconds (configurable via `LIMITLESS_SYNC_INTERVAL`)
- **Enable Flag**: `LIMITLESS_ENABLE_SYNC` environment variable
- **MCP Tool**: `limitless_sync_status` available for checking sync state

### Checking MCP Server Logs

1. **Claude Desktop Logs Location**:

   ```
   macOS: ~/Library/Logs/Claude/
   Windows: %APPDATA%\Claude\logs\
   Linux: ~/.config/Claude/logs/
   ```

2. **Enable Debug Logging**:

   ```bash
   # In MCP configuration
   export LOG_LEVEL=DEBUG
   export DEBUG_PHASE2=true
   export DEBUG_SYNC=true
   ```

3. **Real-time Log Monitoring**:

   ```bash
   # Watch Claude Desktop logs
   tail -f ~/Library/Logs/Claude/*.log | grep -i "limitless"

   # Or use Console.app on macOS
   # Filter by process: Claude or subsystem: com.anthropic.claude
   ```

## Monitoring Implementation Plan

### Phase 1: Basic Monitoring (Week 1)

#### 1.1 Sync Status Dashboard

Create a simple monitoring endpoint that exposes:

- Last sync timestamp
- Number of new lifelogs found
- Sync success/failure rate
- Next sync scheduled time

**Implementation**:

```typescript
// src/monitoring/sync-dashboard.ts
export interface SyncMetrics {
  lastSync: Date;
  nextSync: Date;
  newLifelogsCount: number;
  totalLifelogs: number;
  syncErrors: Error[];
  isRunning: boolean;
}
```

#### 1.2 File System Watcher

Monitor the data directory for new files:

```typescript
// src/monitoring/file-watcher.ts
import { watch } from 'fs';
import { EventEmitter } from 'events';

export class LifelogWatcher extends EventEmitter {
  watch(dataDir: string) {
    watch(dataDir, { recursive: true }, (event, filename) => {
      if (filename?.endsWith('.md')) {
        this.emit('new-lifelog', filename);
      }
    });
  }
}
```

### Phase 2: Smart Notifications (Week 2)

#### 2.1 Notification Channels

1. **Local Notifications** (Native OS):

   ```typescript
   // Using node-notifier
   import notifier from 'node-notifier';

   notifier.notify({
     title: 'New Lifelog Available',
     message: '3 new recordings from today',
     sound: true,
   });
   ```

2. **Webhook Notifications**:

   ```typescript
   // Configuration in env
   NOTIFICATION_WEBHOOK_URL=https://hooks.slack.com/...
   NOTIFICATION_WEBHOOK_HEADERS={"Authorization": "Bearer ..."}
   ```

3. **Email Notifications** (via SendGrid/AWS SES):
   ```typescript
   // Daily digest emails
   NOTIFICATION_EMAIL_ENABLED=true
   NOTIFICATION_EMAIL_TO=user@example.com
   NOTIFICATION_EMAIL_SCHEDULE="0 18 * * *" // 6 PM daily
   ```

#### 2.2 Notification Rules Engine

```typescript
// src/monitoring/notification-rules.ts
interface NotificationRule {
  id: string;
  name: string;
  condition: {
    type: 'keyword' | 'pattern' | 'time' | 'count';
    value: any;
  };
  action: {
    type: 'notify' | 'webhook' | 'email' | 'summary';
    config: any;
  };
}

// Example rules:
const rules: NotificationRule[] = [
  {
    id: 'urgent-keyword',
    name: 'Urgent Items',
    condition: { type: 'keyword', value: ['urgent', 'asap', 'critical'] },
    action: { type: 'notify', config: { priority: 'high' } },
  },
  {
    id: 'daily-summary',
    name: 'Daily Summary',
    condition: { type: 'time', value: '18:00' },
    action: { type: 'email', config: { template: 'daily-digest' } },
  },
];
```

### Phase 3: Automated Summaries (Week 3)

#### 3.1 Summary Generation Pipeline

1. **Incremental Summaries**:

   ```typescript
   // Generate summaries for new content only
   interface SummaryJob {
     lifelogIds: string[];
     summaryType: 'quick' | 'detailed' | 'action-items';
     schedule: 'immediate' | 'batched' | 'daily';
   }
   ```

2. **Summary Templates**:

   ```typescript
   // src/monitoring/summary-templates.ts
   export const summaryTemplates = {
     'new-content': {
       prompt: 'Summarize the key points from these new recordings',
       maxLength: 500,
       includeMetadata: true,
     },
     'daily-digest': {
       prompt:
         'Create a daily digest with sections for: meetings, decisions, action items, and insights',
       maxLength: 1500,
       format: 'markdown',
     },
     'weekly-report': {
       prompt: "Analyze patterns and trends from this week's recordings",
       maxLength: 2000,
       includeStats: true,
     },
   };
   ```

3. **Summary Storage**:
   ```
   /data/summaries/
     /YYYY/MM/DD/
       daily-digest.md
       new-content-{timestamp}.md
     /YYYY/WW/
       weekly-report.md
   ```

#### 3.2 AI-Powered Analysis

Using the existing Claude integration:

```typescript
// src/monitoring/ai-analyzer.ts
export class AIAnalyzer {
  async analyzeNewContent(lifelogIds: string[]): Promise<Analysis> {
    // Use limitless_analyze_lifelogs tool
    const analysis = await this.mcpClient.callTool('limitless_analyze_lifelogs', {
      query: `Analyze these new recordings for: 
        1. Important decisions made
        2. Action items created
        3. Key topics discussed
        4. Potential follow-ups needed`,
      lifelogIds,
    });

    return this.formatAnalysis(analysis);
  }
}
```

### Phase 4: Advanced Features (Week 4+)

#### 4.1 Predictive Monitoring

- Detect patterns in recording times
- Predict when new content will arrive
- Pre-warm caches before expected busy times

#### 4.2 Smart Alerts

- Anomaly detection (unusual recording patterns)
- Keyword trend analysis
- Meeting follow-up reminders

#### 4.3 Integration with Calendar

- Correlate recordings with calendar events
- Auto-tag recordings with meeting names
- Generate meeting summaries automatically

## Implementation Roadmap

### Week 1: Foundation

- [ ] Implement sync status dashboard
- [ ] Add file system watcher
- [ ] Create basic notification system
- [ ] Add monitoring MCP tools

### Week 2: Notifications

- [ ] Implement notification rules engine
- [ ] Add webhook support
- [ ] Create notification templates
- [ ] Test with real data

### Week 3: Summaries

- [ ] Build summary generation pipeline
- [ ] Create summary templates
- [ ] Implement batched processing
- [ ] Add summary storage

### Week 4: Polish & Deploy

- [ ] Add error handling and retry logic
- [ ] Implement rate limiting
- [ ] Create monitoring dashboard UI
- [ ] Write documentation

## Configuration Examples

### Basic Monitoring Setup

```bash
# Enable sync and monitoring
LIMITLESS_ENABLE_SYNC=true
LIMITLESS_SYNC_INTERVAL=60000  # 1 minute
MONITORING_ENABLED=true
MONITORING_LOG_NEW_ITEMS=true

# Start server with monitoring
npm run start:monitor
```

### Advanced Configuration

```bash
# Full monitoring suite
LIMITLESS_ENABLE_SYNC=true
LIMITLESS_SYNC_INTERVAL=30000  # 30 seconds

# Notifications
NOTIFICATION_CHANNELS=local,webhook,email
NOTIFICATION_WEBHOOK_URL=https://your-webhook.com
NOTIFICATION_EMAIL_TO=user@example.com
NOTIFICATION_RULES_FILE=./config/notification-rules.json

# Summaries
SUMMARY_AUTO_GENERATE=true
SUMMARY_TYPES=new-content,daily-digest
SUMMARY_STORAGE_PATH=./data/summaries
SUMMARY_USE_CLAUDE=true

# Monitoring
MONITORING_DASHBOARD_PORT=3000
MONITORING_METRICS_ENABLED=true
```

## Testing Strategy

### 1. Unit Tests

```typescript
// tests/monitoring/
-file -
  watcher.test.ts -
  notification -
  rules.test.ts -
  summary -
  generator.test.ts -
  ai -
  analyzer.test.ts;
```

### 2. Integration Tests

```typescript
// tests/integration/monitoring/
-full - monitoring - flow.test.ts - notification - delivery.test.ts - summary - accuracy.test.ts;
```

### 3. Load Tests

- Simulate high-frequency updates
- Test notification throttling
- Verify summary generation performance

## Success Metrics

1. **Monitoring Reliability**

   - 99.9% uptime for sync service
   - < 60s delay for new content detection
   - Zero missed notifications for configured rules

2. **Summary Quality**

   - 90%+ accuracy in action item extraction
   - < 2 minutes for summary generation
   - Positive user feedback on summary usefulness

3. **Performance Impact**
   - < 5% CPU overhead for monitoring
   - < 50MB additional memory usage
   - No impact on main MCP server performance

## Next Steps

1. **Immediate Actions**:

   - Review and approve this plan
   - Set up basic monitoring infrastructure
   - Create GitHub issues for each phase

2. **Technical Decisions**:

   - Choose notification service (local vs cloud)
   - Decide on summary storage format
   - Select monitoring dashboard framework

3. **User Research**:
   - Survey users on desired notification types
   - Gather feedback on summary formats
   - Identify most valuable monitoring features
