#!/bin/bash

# Text Search Tool - Ripgrep wrapper for fast text search
# Usage: text-search.sh "search pattern" [options]

# Default values
SEARCH_DIR="${SEARCH_DIR:-./data/lifelogs}"
MAX_RESULTS="${MAX_RESULTS:-50}"
CONTEXT_LINES="${CONTEXT_LINES:-2}"
CASE_SENSITIVE="${CASE_SENSITIVE:-false}"
REGEX_MODE="${REGEX_MODE:-false}"

# Function to show help
show_help() {
    cat << EOF
Text Search Tool - Fast text search using ripgrep

Usage: text-search.sh "search pattern" [options]

Options:
  -d, --dir PATH         Search directory (default: ./data/lifelogs)
  -m, --max NUM          Maximum results (default: 50)
  -c, --context NUM      Context lines before/after match (default: 2)
  -s, --case-sensitive   Enable case-sensitive search
  -r, --regex            Enable regex mode
  -h, --help             Show this help message

Environment Variables:
  SEARCH_DIR             Override default search directory
  MAX_RESULTS            Override default max results
  CONTEXT_LINES          Override default context lines

Examples:
  text-search.sh "meeting notes"
  text-search.sh "action.*item" --regex
  text-search.sh "IMPORTANT" --case-sensitive

Output Format:
  JSON with file paths, line numbers, and matched content
EOF
    exit 0
}

# Parse arguments
SEARCH_PATTERN=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--dir)
            SEARCH_DIR="$2"
            shift 2
            ;;
        -m|--max)
            MAX_RESULTS="$2"
            shift 2
            ;;
        -c|--context)
            CONTEXT_LINES="$2"
            shift 2
            ;;
        -s|--case-sensitive)
            CASE_SENSITIVE="true"
            shift
            ;;
        -r|--regex)
            REGEX_MODE="true"
            shift
            ;;
        -h|--help)
            show_help
            ;;
        *)
            if [ -z "$SEARCH_PATTERN" ]; then
                SEARCH_PATTERN="$1"
            fi
            shift
            ;;
    esac
done

# Check if search pattern provided
if [ -z "$SEARCH_PATTERN" ]; then
    echo '{"error": "No search pattern provided"}'
    exit 1
fi

# Check if ripgrep is available
if ! command -v rg &> /dev/null; then
    # Try to use the bundled ripgrep from Claude Code
    RG_PATH="/Users/ericbuess/.nvm/versions/node/v24.1.0/lib/node_modules/@anthropic-ai/claude-code/vendor/ripgrep/arm64-darwin/rg"
    if [ -x "$RG_PATH" ]; then
        alias rg="$RG_PATH"
    else
        echo '{"error": "ripgrep not found. Please install ripgrep or use Claude Code."}'
        exit 1
    fi
fi

# Build ripgrep command
RG_CMD="rg"
RG_ARGS=(
    "--json"
    "--max-count" "$MAX_RESULTS"
    "--context" "$CONTEXT_LINES"
    "--type" "md"
    "--glob" "*.md"
)

# Add case sensitivity flag
if [ "$CASE_SENSITIVE" = "true" ]; then
    RG_ARGS+=("--case-sensitive")
else
    RG_ARGS+=("--ignore-case")
fi

# Add regex flag if not in regex mode (treat as literal)
if [ "$REGEX_MODE" = "false" ]; then
    RG_ARGS+=("--fixed-strings")
fi

# Execute search and format results
{
    echo '{'
    echo '  "query": "'$SEARCH_PATTERN'",'
    echo '  "searchDir": "'$SEARCH_DIR'",'
    echo '  "options": {'
    echo '    "maxResults": '$MAX_RESULTS','
    echo '    "contextLines": '$CONTEXT_LINES','
    echo '    "caseSensitive": '$CASE_SENSITIVE','
    echo '    "regexMode": '$REGEX_MODE
    echo '  },'
    echo '  "results": ['
    
    FIRST=true
    $RG_CMD "${RG_ARGS[@]}" "$SEARCH_PATTERN" "$SEARCH_DIR" 2>/dev/null | while IFS= read -r line; do
        # Parse ripgrep JSON output
        MSG_TYPE=$(echo "$line" | jq -r '.type' 2>/dev/null)
        
        if [ "$MSG_TYPE" = "match" ]; then
            if [ "$FIRST" = "true" ]; then
                FIRST=false
            else
                echo ','
            fi
            
            # Extract match information
            FILE_PATH=$(echo "$line" | jq -r '.data.path.text')
            LINE_NUM=$(echo "$line" | jq -r '.data.line_number')
            LINE_TEXT=$(echo "$line" | jq -r '.data.lines.text' | tr -d '\n')
            
            # Extract lifelog ID from file path
            LIFELOG_ID=$(basename "$FILE_PATH" .md)
            
            # Format as JSON
            echo -n '    {'
            echo -n '"id": "'$LIFELOG_ID'",'
            echo -n '"file": "'$FILE_PATH'",'
            echo -n '"line": '$LINE_NUM','
            echo -n '"text": '$(echo "$LINE_TEXT" | jq -Rs .)
            echo -n '}'
        fi
    done
    
    echo ''
    echo '  ],'
    echo '  "totalMatches": '$(rg "${RG_ARGS[@]}" "$SEARCH_PATTERN" "$SEARCH_DIR" 2>/dev/null | grep -c '"type":"match"')
    echo '}'
} | jq . 2>/dev/null || echo '{"error": "Failed to format results"}'