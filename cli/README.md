If you want to test the CLI locally based on changes you make to the CLI script and worker / control-plane, you can do the following:

```
cd /Users/gauravvarma/Repositories/samata
docker build -f control-plane/Dockerfile -t samata-local/samata-control-plane:dev .
docker build -t samata-local/samata-worker:dev worker

cd /tmp && rm -rf try-it
SAMATA_IMAGE_PREFIX=samata-local SAMATA_VERSION=dev \
node /Users/gauravvarma/Repositories/samata/cli/bin/samata.mjs init try-it --test \
  --compose /Users/gauravvarma/Repositories/samata/deploy/docker-compose.local.yml
```

With the --test flag, none of the ports conflict with samata local dev set up or usual samata local quickstart setup
