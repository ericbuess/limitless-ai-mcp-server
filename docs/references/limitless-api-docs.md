Title: Limitless Developer Platform

URL Source: https://www.limitless.ai/developers

Markdown Content:
Limitless Developer Platform
----------------------------

Your data is yours to use. Build your own integrations with our API.

Note: The Developer API is currently in beta. Because the current endpoints only work with Pendant data, it is only available to Pendant owners. We plan to add more endpoints very soon. Order your own Pendant[here](https://www.limitless.ai/).

#### Table of Contents

[Setup](https://www.limitless.ai/developers#setup)[Endpoints](https://www.limitless.ai/developers#endpoints)[Usage](https://www.limitless.ai/developers#usage)

Setup
-----

### 1. Access Developer settings

First, you'll need to join Limitless if you haven't already. Then, pair your Pendant with your Limitless account. After pairing, open the Desktop or[Web App](https://app.limitless.ai/) to copy your API key. You'll see the Developer link appear in your Limitless Desktop or Web App:

![Image 1: Developer API screenshot](https://www.limitless.ai/_next/image?url=%2Fmedia%2Fdeveloper-tab.png&w=640&q=75)

### 2. Create an API Key

Once you're logged in, you can create an API key by clicking the "Create API Key" button in the top right corner of the screen.

![Image 2: Developer API screenshot](https://www.limitless.ai/_next/image?url=%2Fmedia%2Fdeveloper-api-key.png&w=1920&q=75)

The security of your data is incredibly important to us.NEVER share your API key, commit it to a source repository, or otherwise expose it to third parties.

### 3. Use the API

Now that you have an API key, you can use it to access the API. Here's an example of how to use the API to get your 3 most recent Lifelog entries:

`curl -H "X-API-Key: YOUR_API_KEY" https://api.limitless.ai/v1/lifelogs`

There are many parameters you can use to customize your API request. For more information, see the[API documentation](https://www.limitless.ai/developers).

Endpoints
---------

While the Developer API is in beta, it only supports Pendant data. We plan to add more endpoints very soon.

Usage
-----

Authentication
--------------

All API requests require authentication using an API key.

Include your API key in the`X-API-Key`header with each request:

`curl -H "X-API-Key: YOUR_API_KEY" https://api.limitless.ai/v1/lifelogs`

You can obtain an API key from the Developer settings in your Limitless account.

Requests
--------

#### Query Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| timezone | string | [IANA timezone specifier](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones). If missing, UTC is used.Optional. |
| date | string (date) | Will return all entries beginning on a date in the given timezone (`YYYY-MM-DD`). If`start`or`end`are provided,`date`will be ignored. |
| start | string (date-time) | Start datetime in modified[ISO-8601](https://en.wikipedia.org/wiki/ISO_8601)format (`YYYY-MM-DD`or`YYYY-MM-DD HH:mm:SS`). Timezones/offsets will be ignored; use the query parameter instead. |
| end | string (date-time) | End datetime in modified[ISO-8601](https://en.wikipedia.org/wiki/ISO_8601)format (`YYYY-MM-DD`or`YYYY-MM-DD HH:mm:SS`). Timezones/offsets will be ignored; use the query parameter instead. |
| cursor | string | Cursor for pagination to retrieve the next set of lifelogs. Optional. |
| direction | string (enum) | Sort direction for lifelogs. Allowed values:`asc`,`desc`. Default:`desc` |
| includeMarkdown | boolean | Whether to include markdown content in the response.Default:`true` |
| includeHeadings | boolean | Whether to include headings in the response.Default:`true` |
| limit | integer | Maximum number of lifelogs to return. (Max value is 10; use the cursor parameter for pagination).Default:`3` |

#### Response

Returns a 200 status code with the following response body:

```
{
  "data": {
    "lifelogs": [
      {
        "id": "string",
        "title": "string",
        "markdown": "string",
        "startTime": "ISO-8601 string",
        "endTime": "ISO-8601 string",
        "contents": [
          {
            "type": "heading1" | "heading2" | "blockquote",
            "content": "string",
            "startTime": "ISO-8601 string",
            "endTime": "ISO-8601 string",
            "startOffsetMs": "timestamp in milliseconds",
            "endOffsetMs": "timestamp in milliseconds",
            "children": [],
            "speakerName": "string",
            "speakerIdentifier": "user" | null
          }
        ]
      }
    ]
  },
  "meta": {
    "lifelogs": {
      "nextCursor": "string",
      "count": 0
    }
  }
}
```

#### Example Request

```
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.limitless.ai/v1/lifelogs?date=2025-03-11&timezone=America/Los_Angeles"
```

#### Example Code (TypeScript)

```
const params = new URLSearchParams({
  date: '2025-03-11',
  timezone: 'America/Los_Angeles'
});
const response = await fetch(`https://api.limitless.ai/v1/lifelogs?${params}`, {
  method: 'GET',
  headers: {
    'X-API-Key': 'YOUR_API_KEY',
  },
});
```

#### Example Code (Python)

```
import requests

response = requests.get('https://api.limitless.ai/v1/lifelogs', params={
  'date': '2025-03-11',
  'timezone': 'America/Los_Angeles'
}, headers={'X-API-Key': 'YOUR_API_KEY'})
```

#### Query Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| :id | string | The ID of the lifelog entry to retrieve, given in the URL. |
| includeMarkdown | boolean | Whether to include markdown content in the response.Default:`true` |
| includeHeadings | boolean | Whether to include headings in the response.Default:`true` |

#### Response

Returns a 200 status code with the following response body:

```
{
  "data": {
    "lifelog": {
      "id": "string",
      "title": "string",
      "markdown": "string",
      "startTime": "ISO-8601 string",
      "endTime": "ISO-8601 string",
      "contents": [
        {
          "type": "heading1" | "heading2" | "blockquote",
          "content": "string",
          "startTime": "ISO-8601 string",
          "endTime": "ISO-8601 string",
          "startOffsetMs": "timestamp in milliseconds",
          "endOffsetMs": "timestamp in milliseconds",
          "children": [],
          "speakerName": "string",
          "speakerIdentifier": "user" | null
        }
      ]
    }
  }
}
```

#### Example Request

```
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.limitless.ai/v1/lifelogs/123"
```

#### Example Code (TypeScript)

```
const response = await fetch('https://api.limitless.ai/v1/lifelogs/123', {
  method: 'GET',
  headers: {
    'X-API-Key': 'YOUR_API_KEY',
  },
});
```

#### Example Code (Python)

```
import requests

response = requests.get('https://api.limitless.ai/v1/lifelogs/123', headers={'X-API-Key': 'YOUR_API_KEY'})
```