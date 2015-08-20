'use strict';

/* Test fail with confusing message if running server.js &
    tests at the same time.
*/

require('./endpoint-logging.js');
require('./health.js');
require('./register/');
require('./forward/');
require('./clients/');
require('./child-process/');
require('./hosts/');
require('./connections/');
require('./circuits/');
require('./hyperbahn-client.js');
require('./admin/');
require('./trace.js');
require('./remote-config-client.js');
require('./remote-config.js');
require('./time-series/requesting-a-service-with-spiky-traffic.js');
