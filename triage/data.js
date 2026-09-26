/*
  Sample tickets from the project's data/sample_incidents.csv, plus one recorded agent run for each.
  A run lists the tools the agent called, in the order it chose them. The final answer is what it
  passed to finalize_triage. lookup_similar_incidents is answered live from whatever the demo has
  already triaged, the same way the server queries its database.
*/
var CATEGORIES = {
    access_issue: 'Access',
    deployment_issue: 'Deployment',
    data_issue: 'Data',
    configuration_issue: 'Configuration',
    performance_issue: 'Performance',
    security_issue: 'Security',
    compliance_issue: 'Compliance',
    infrastructure_issue: 'Infrastructure'
};

var INCIDENTS = [
    {
        id: 'INC-001', title: 'Login failure for client X',
        description: 'Users unable to log in after the latest deployment',
        reported_by: 'Jane Smith', assigned_to: null, status: 'Open', priority: 'High',
        system: 'Auth Service', tags: 'login;auth', created_at: null,
        run: {
            order: ['classify_incident', 'score_urgency', 'lookup_similar_incidents', 'recommend_actions'],
            category: 'deployment_issue',
            urgency_score: 8.4,
            summary: 'Users of client X can’t sign in since the latest Auth Service release. Everyone affected is locked out, and the timing points straight at the deployment, so the impact is high but the cause should be quick to confirm.',
            next_actions: [
                'Compare Auth Service error logs from before and after the release',
                'Roll back the latest Auth Service deployment if the errors started with it',
                'Assign an on-call owner from the identity team',
                'Update client X’s account team with the status and expected fix time'
            ],
            process_gaps: ['No post-deployment smoke test caught the login failure']
        }
    },
    {
        id: 'INC-002', title: 'Data export missing records',
        description: 'Monthly export job returned 0 rows with no error logged',
        reported_by: 'John Doe', assigned_to: null, status: 'Open', priority: null,
        system: 'Reporting', tags: 'export;data', created_at: null,
        run: {
            order: ['classify_incident', 'score_urgency', 'recommend_actions'],
            category: 'data_issue',
            urgency_score: 6.1,
            summary: 'The monthly export ran but produced an empty file, and nothing was logged. Reports built from it could be wrong without anyone noticing, which makes this a silent data-quality problem.',
            next_actions: [
                'Run the export query by hand to confirm the source data exists',
                'Check the export job for schema or filter changes since last month',
                'Make the job fail loudly when it returns 0 rows',
                'Hold this month’s report until a verified export is available'
            ],
            process_gaps: ['The export job fails silently: nothing alerts on empty output']
        }
    },
    {
        id: 'INC-003', title: 'Admin panel 403 errors',
        description: 'Admins receive 403 Forbidden when opening settings page',
        reported_by: 'Alice Lee', assigned_to: 'Bob Chen', status: 'Open', priority: 'Medium',
        system: 'Admin Portal', tags: 'permissions', created_at: null,
        run: {
            order: ['classify_incident', 'score_urgency', 'recommend_actions'],
            category: 'access_issue',
            urgency_score: 4.8,
            summary: 'Admins get a 403 Forbidden error on the settings page. The rest of the portal works and only admins are affected, so the impact is contained, but settings can’t be changed until it’s fixed.',
            next_actions: [
                'Review recent role and permission changes for the admin group',
                'Check the settings page’s authorization rule against the admin role',
                'Reproduce the error with a test admin account'
            ],
            process_gaps: []
        }
    },
    {
        id: 'INC-004', title: 'API latency spike',
        description: 'API response times jumped to 8s after a config change',
        reported_by: 'Bob Chen', assigned_to: null, status: 'Open', priority: 'High',
        system: 'Gateway', tags: 'performance;config', created_at: null,
        run: {
            order: ['classify_incident', 'lookup_similar_incidents', 'score_urgency', 'recommend_actions'],
            category: 'performance_issue',
            urgency_score: 7.9,
            summary: 'Gateway response times jumped to about 8 seconds right after a configuration change. Every service behind the gateway slows down, and reverting the change is likely the fastest fix.',
            next_actions: [
                'Revert the latest gateway config change and watch response times',
                'Compare the old and new config for timeout, pool size, or rate-limit changes',
                'Assign an owner from the platform team',
                'Require a latency check before gateway config changes go live'
            ],
            process_gaps: ['A config change reached production without a performance check']
        }
    },
    {
        id: 'INC-005', title: 'Database connection pool exhausted',
        description: 'Connections maxed out causing intermittent 500s',
        reported_by: 'Carol White', assigned_to: null, status: 'Open', priority: 'Critical',
        system: 'Postgres', tags: 'database', created_at: null,
        run: {
            order: ['classify_incident', 'score_urgency', 'recommend_actions'],
            category: 'infrastructure_issue',
            urgency_score: 9.1,
            summary: 'The Postgres connection pool is maxed out, so requests fail with intermittent 500 errors. Every service that uses this database is affected, and it will get worse under heavier load.',
            next_actions: [
                'Page the database on-call engineer and make them the owner',
                'Find which services hold the most connections and look for leaks or long-running queries',
                'Raise the pool limit or add a connection pooler to stabilize things',
                'Alert when pool usage passes 80%'
            ],
            process_gaps: ['No alert fired before the pool ran out']
        }
    },
    {
        id: 'INC-006', title: 'Deployment rollback needed',
        description: 'The v2.3.1 release to production caused checkout failures for users in the EU region. Rollback has been requested but no engineer has been assigned.',
        reported_by: 'sarah.lee@company.com', assigned_to: null, status: 'Open', priority: 'Critical',
        system: 'checkout-service', tags: 'deployment,rollback', created_at: '2026-06-05T11:30:00',
        run: {
            order: ['classify_incident', 'lookup_similar_incidents', 'score_urgency', 'recommend_actions'],
            category: 'deployment_issue',
            urgency_score: 9.6,
            summary: 'Release v2.3.1 broke checkout for customers in the EU, so they can’t complete purchases. A rollback was requested but nobody owns it, and every hour of delay is lost revenue.',
            next_actions: [
                'Assign an engineer to own the rollback now',
                'Roll checkout-service back to v2.3.0',
                'Confirm EU checkout works with a test purchase',
                'Find out why v2.3.1 failed only in the EU before releasing it again'
            ],
            process_gaps: [
                'A critical rollback was requested with no owner',
                'Release testing didn’t cover region-specific checkout'
            ]
        }
    },
    {
        id: 'INC-007', title: 'Memory leak in reporting service',
        description: 'The reporting microservice memory usage grows by 200MB per hour and requires manual restarts every 6 hours. Issue has been known for 3 weeks.',
        reported_by: 'dev-monitoring@company.com', assigned_to: 'dev-team', status: 'Open', priority: 'Low',
        system: 'reporting-service', tags: 'memory,recurring', created_at: '2026-05-14T10:00:00',
        run: {
            order: ['classify_incident', 'score_urgency', 'lookup_similar_incidents', 'recommend_actions'],
            category: 'performance_issue',
            urgency_score: 5.4,
            summary: 'The reporting service leaks about 200 MB of memory an hour and needs a manual restart every 6 hours. It’s contained for now, but the restarts are ongoing toil, and one missed restart means an outage.',
            next_actions: [
                'Automate a scheduled restart as a stopgap',
                'Compare heap snapshots taken a few hours apart to find what’s growing',
                'Raise the priority: this has been recurring for 3 weeks',
                'Name one person on dev-team as the owner'
            ],
            process_gaps: [
                'Priority is Low even though the issue has recurred for 3 weeks',
                'Assigned to a team rather than a person'
            ]
        }
    },
    {
        id: 'INC-008', title: 'User data export failing',
        description: 'Customer requested GDPR data export 5 days ago. The export job fails silently with no user notification. Compliance deadline is 30 days from request.',
        reported_by: 'compliance@company.com', assigned_to: null, status: 'Open', priority: 'High',
        system: 'user-data-service', tags: 'gdpr,compliance', created_at: '2026-06-01T09:00:00',
        run: {
            order: ['classify_incident', 'score_urgency', 'recommend_actions'],
            category: 'compliance_issue',
            urgency_score: 8.7,
            summary: 'A customer’s GDPR data export has been failing silently, and they haven’t been told. There’s a legal 30-day deadline, so this is a compliance risk even though only one customer is affected.',
            next_actions: [
                'Assign an owner and loop in the privacy lead',
                'Produce the export by hand so the deadline is met',
                'Let the customer know their request is in progress',
                'Add failure alerts and customer notifications to the export job'
            ],
            process_gaps: ['The export job fails without telling anyone', 'No owner or deadline tracking on a compliance request']
        }
    }
];
