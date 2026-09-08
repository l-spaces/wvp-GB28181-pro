#!/bin/bash
# WVP 部署更换对外 IP
# 用法: ./change-ip.sh <新IP>
# 示例: ./change-ip.sh 1.2.3.4
#
# 修改 docker-compose.yml 中三个对外 IP 参数:
#   MEDIA_SDP_IP    设备(摄像头)推流目标 IP
#   MEDIA_STREAM_IP 返回给播放器的流地址 IP
#   WVP_SHOW_IP     页面"接入信息"展示 IP
# 三者通常相同, 均填客户端可达的服务器 IP。

set -e

NEW_IP="$1"

if [ -z "$NEW_IP" ]; then
    echo "用法: $0 <新IP>    例如: $0 1.2.3.4"
    exit 1
fi

if ! echo "$NEW_IP" | grep -qE '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'; then
    echo "错误: IP 格式不合法: $NEW_IP"
    exit 1
fi

# 定位脚本所在目录下的 docker-compose.yml
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "错误: 未找到 $COMPOSE_FILE (脚本需与 docker-compose.yml 同目录)"
    exit 1
fi

echo "=== 当前 IP 配置 ==="
grep -E 'MEDIA_SDP_IP|MEDIA_STREAM_IP|WVP_SHOW_IP' "$COMPOSE_FILE"

# 备份
BACKUP="${COMPOSE_FILE}.bak.$(date +%Y%m%d%H%M%S)"
cp "$COMPOSE_FILE" "$BACKUP"
echo ""
echo "已备份: $BACKUP"

# 替换三个环境变量(无论旧值是什么)
sed -i "s|MEDIA_SDP_IP: \"[^\"]*\"|MEDIA_SDP_IP: \"$NEW_IP\"|" "$COMPOSE_FILE"
sed -i "s|MEDIA_STREAM_IP: \"[^\"]*\"|MEDIA_STREAM_IP: \"$NEW_IP\"|" "$COMPOSE_FILE"
sed -i "s|WVP_SHOW_IP: \"[^\"]*\"|WVP_SHOW_IP: \"$NEW_IP\"|" "$COMPOSE_FILE"

echo ""
echo "=== 已更新为 $NEW_IP ==="
grep -E 'MEDIA_SDP_IP|MEDIA_STREAM_IP|WVP_SHOW_IP' "$COMPOSE_FILE"

# 应用
echo ""
read -t 30 -p "是否立即重启服务应用新 IP? [y/N] " confirm || true
echo ""
if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    cd "$SCRIPT_DIR"
    docker compose up -d
    echo "等待启动..."
    sleep 25
    echo "=== wvp-main 关键日志 ==="
    docker logs wvp-main --since 1m 2>&1 | grep -aiE 'SIP SERVER|ZLM-连接成功|Started VManageBootstrap|ERROR' | tail -5
    echo ""
    echo "完成。请确认上方日志正常(应有 SIP SERVER 启动成功 / ZLM-连接成功)。"
else
    echo "配置已修改但未重启。稍后手动执行: cd $SCRIPT_DIR && docker compose up -d"
fi

echo ""
echo "=== 提醒 ==="
echo "1. 新 IP 侧防火墙/安全组需放行: 8160/tcp+udp  10000/udp  18978/tcp  18080/tcp"
echo "2. 公网部署时建议注释掉 13306(mysql) 和 16379(redis) 的端口映射"
echo "3. 摄像头需将 SIP 服务器地址更新为: ${NEW_IP}:8160 (其余接入参数不变)"
echo "4. 如需回退: cp $BACKUP docker-compose.yml && docker compose up -d"
