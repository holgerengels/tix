#!/usr/bin/env bash
#
# Sync remote MongoDB → local dev MongoDB (Tix)
#
# Supports two modes:
#   1. SSH Tunnel Mode (when an SSH tunnel is open to remote Mongo):
#      ./scripts/sync-db.sh --tunnel 27018
#      TUNNEL_PORT=27018 ./scripts/sync-db.sh
#
#   2. Direct SSH Mode (connects to remote server over SSH & streams dump):
#      ./scripts/sync-db.sh vbs@server
#      REMOTE_HOST=vbs@server ./scripts/sync-db.sh
#
# Optional: specify specific collections to sync:
#      ./scripts/sync-db.sh --tunnel 27018 tickets users
#
set -euo pipefail

# --- Configuration defaults ---
LOCAL_CONTAINER="${LOCAL_CONTAINER:-mongodb}"
LOCAL_DB="${LOCAL_DB:-tickets}"
LOCAL_AUTH="${LOCAL_AUTH:---username admin --password password --authenticationDatabase admin}"

REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_CONTAINER="${REMOTE_CONTAINER:-}"
REMOTE_DB="${REMOTE_DB:-tickets}"
REMOTE_AUTH="${REMOTE_AUTH:---username admin --password password --authenticationDatabase admin}"

TUNNEL_PORT="${TUNNEL_PORT:-}"
TUNNEL_HOST="${TUNNEL_HOST:-localhost}"

DUMP_DIR="/tmp/mongodump-tix"
COLLECTIONS=()

# --- Argument Parsing ---
while [[ $# -gt 0 ]]; do
    case "$1" in
        --tunnel|-t)
            if [[ $# -gt 1 && "$2" =~ ^[0-9]+$ ]]; then
                TUNNEL_PORT="$2"
                shift 2
            else
                TUNNEL_PORT="${TUNNEL_PORT:-27018}"
                shift 1
            fi
            ;;
        --port|-p)
            TUNNEL_PORT="$2"
            shift 2
            ;;
        *)
            # If it's a number, treat as tunnel port
            if [[ "$1" =~ ^[0-9]+$ ]]; then
                TUNNEL_PORT="$1"
            # If it looks like user@host or a hostname/IP
            elif [[ "$1" == *"@"* || "$1" == *"."* ]]; then
                REMOTE_HOST="$1"
            else
                COLLECTIONS+=("$1")
            fi
            shift
            ;;
    esac
done

echo "========================================================"
echo "          TIX Database Synchronization"
echo "========================================================"
echo "Local target: Container '$LOCAL_CONTAINER', Database '$LOCAL_DB'"

# Verify local container is running
if ! docker ps --format '{{.Names}}' | grep -wq "$LOCAL_CONTAINER"; then
    echo "❌ Local container '$LOCAL_CONTAINER' is not running."
    echo "   Please start it with: docker compose up -d mongodb"
    exit 1
fi

# ==============================================================================
# MODE 1: SSH Tunnel Mode
# ==============================================================================
if [[ -n "$TUNNEL_PORT" ]]; then
    echo "Mode: SSH Tunnel (via $TUNNEL_HOST:$TUNNEL_PORT)"
    echo ""
    echo "📦 Dumping from tunnel ($TUNNEL_HOST:$TUNNEL_PORT/$REMOTE_DB)..."

    COLLECTION_ARGS=""
    if [[ ${#COLLECTIONS[@]} -gt 0 ]]; then
        echo "   Collections to sync: ${COLLECTIONS[*]}"
        for col in "${COLLECTIONS[@]}"; do
            COLLECTION_ARGS="$COLLECTION_ARGS --collection $col"
        done
    else
        echo "   Syncing all collections"
    fi

    # Stream dump through archive over tunnel directly into local mongorestore
    # Using docker run with host network avoids needing mongodump on the host machine
    docker run --rm --network host mongo:7 \
        mongodump \
        --host "$TUNNEL_HOST" \
        --port "$TUNNEL_PORT" \
        $REMOTE_AUTH \
        --db "$REMOTE_DB" \
        $COLLECTION_ARGS \
        --archive \
    | docker exec -i "$LOCAL_CONTAINER" \
        mongorestore \
        $LOCAL_AUTH \
        --nsInclude="$REMOTE_DB.*" \
        --nsFrom="$REMOTE_DB.*" \
        --nsTo="$LOCAL_DB.*" \
        --drop \
        --archive

    echo ""
    echo "✅ Restore into local database '$LOCAL_DB' completed successfully!"
    exit 0
fi

# ==============================================================================
# MODE 2: Direct SSH Mode (SSH + Docker exec)
# ==============================================================================
if [[ -z "$REMOTE_HOST" ]]; then
    echo ""
    echo "❌ Neither TUNNEL_PORT nor REMOTE_HOST is provided."
    echo ""
    echo "Usage Examples:"
    echo "  If you have an SSH tunnel open (e.g. ssh -L 27018:localhost:27017 ...):"
    echo "    ./scripts/sync-db.sh --tunnel 27018"
    echo ""
    echo "  If connecting directly via SSH:"
    echo "    ./scripts/sync-db.sh vbs@server"
    echo "    REMOTE_HOST=vbs@server ./scripts/sync-db.sh [collections...]"
    exit 1
fi

echo "Mode: Direct SSH ($REMOTE_HOST)"

# Detect remote docker command (docker vs sudo docker)
echo "🔍 Checking remote Docker permissions..."
REMOTE_DOCKER=$(ssh "$REMOTE_HOST" "command -v docker >/dev/null && docker ps >/dev/null 2>&1 && echo 'docker' || echo 'sudo docker'")

# Detect remote mongo container name if not set
if [[ -z "$REMOTE_CONTAINER" ]]; then
    echo "🔍 Detecting remote Mongo container..."
    REMOTE_CONTAINER=$(ssh "$REMOTE_HOST" "$REMOTE_DOCKER ps --filter 'name=mongo' --format '{{.Names}}' | head -n 1" || true)
    if [[ -z "$REMOTE_CONTAINER" ]]; then
        REMOTE_CONTAINER="deploy-mongo-1"
    fi
fi
echo "   Remote container: $REMOTE_CONTAINER"

echo ""
echo "📦 Step 1: Dumping remote database inside $REMOTE_CONTAINER..."
ssh "$REMOTE_HOST" "$REMOTE_DOCKER exec $REMOTE_CONTAINER rm -rf $DUMP_DIR 2>/dev/null || true"

DUMP_ARGS=""
if [[ ${#COLLECTIONS[@]} -gt 0 ]]; then
    echo "   Collections: ${COLLECTIONS[*]}"
    for col in "${COLLECTIONS[@]}"; do
        DUMP_ARGS="$DUMP_ARGS --collection $col"
    done
else
    echo "   All collections"
fi

ssh "$REMOTE_HOST" "$REMOTE_DOCKER exec $REMOTE_CONTAINER mongodump \
    $REMOTE_AUTH \
    --db $REMOTE_DB \
    $DUMP_ARGS \
    --out $DUMP_DIR"

echo "   ✅ Remote dump complete"

echo ""
echo "📥 Step 2: Streaming dump to local container..."
docker exec "$LOCAL_CONTAINER" rm -rf /tmp/mongorestore-data 2>/dev/null || true
docker exec "$LOCAL_CONTAINER" mkdir -p /tmp/mongorestore-data

ssh "$REMOTE_HOST" "$REMOTE_DOCKER exec $REMOTE_CONTAINER tar -czf - -C $DUMP_DIR $REMOTE_DB" \
    | docker exec -i "$LOCAL_CONTAINER" tar -xzf - -C /tmp/mongorestore-data

echo "   ✅ Transferred and unpacked in local container"

echo ""
echo "📤 Step 3: Restoring to local database '$LOCAL_DB'..."
docker exec "$LOCAL_CONTAINER" mongorestore \
    $LOCAL_AUTH \
    --db "$LOCAL_DB" \
    --drop \
    "/tmp/mongorestore-data/$REMOTE_DB"

echo "   ✅ Local restore complete"

echo ""
echo "🧹 Step 4: Cleaning up temp files..."
ssh "$REMOTE_HOST" "$REMOTE_DOCKER exec $REMOTE_CONTAINER rm -rf $DUMP_DIR 2>/dev/null || true"
docker exec "$LOCAL_CONTAINER" rm -rf /tmp/mongorestore-data 2>/dev/null || true

echo ""
echo "✅ Sync complete!"
