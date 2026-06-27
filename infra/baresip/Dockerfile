# Pinned baresip + libre build for the ComFlow SIP edge (BSD-3-Clause).
FROM debian:bookworm-slim AS build

ARG RE_VERSION=v3.13.0
ARG BARESIP_VERSION=v3.13.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake git ca-certificates pkg-config \
      libssl-dev libopus-dev libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# libre (the async/SIP library baresip builds on)
RUN git clone --depth 1 --branch ${RE_VERSION} https://github.com/baresip/re.git \
    && cmake -S re -B re/build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --build re/build -j"$(nproc)" \
    && cmake --install re/build \
    && ldconfig

# baresip itself
RUN git clone --depth 1 --branch ${BARESIP_VERSION} https://github.com/baresip/baresip.git \
    && cmake -S baresip -B baresip/build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --build baresip/build -j"$(nproc)" \
    && cmake --install baresip/build \
    && ldconfig

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libssl3 libopus0 libsndfile1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/local /usr/local
RUN ldconfig

# baresip reads its config + accounts from this directory.
ENV BARESIP_PATH=/etc/baresip
VOLUME ["/data"]
EXPOSE 4444/tcp 5060/udp

# -f: config dir, -t no TTY needed; ctrl_tcp drives everything.
ENTRYPOINT ["baresip", "-f", "/etc/baresip"]
