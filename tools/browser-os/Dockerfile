FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

RUN apk add --no-cache \
    ca-certificates \
    git=2.54.0-r0 \
    proot=5.4.0-r2 \
    python3=3.14.8-r0 \
    py3-zstandard=0.25.0-r1 \
    qemu-i386=11.0.3-r0 \
    tar=1.35-r5 \
    wget=1.25.0-r3 \
    zstd=1.5.7-r2
RUN mkdir -p /input

COPY packages.lock /usr/local/share/browser-os/packages.lock
COPY guest/ /usr/local/share/browser-os/guest/
COPY python-zstd-fallback.patch /usr/local/share/browser-os/
COPY guest-build.sh manifest.py source_provenance.py normalize-initramfs.py /usr/local/bin/
RUN chmod 0755 /usr/local/bin/guest-build.sh /usr/local/bin/normalize-initramfs.py

ENTRYPOINT ["/usr/local/bin/guest-build.sh"]
