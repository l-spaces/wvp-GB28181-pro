FROM bellsoft/liberica-openjdk-rocky:21.0.12-cds

WORKDIR /opt/wvp

ENV TZ=Asia/Shanghai

COPY wvp.jar /opt/wvp/wvp.jar
COPY application.yml /opt/wvp/application.yml
COPY application-docker.yml /opt/wvp/application-docker.yml

EXPOSE 18080/tcp
EXPOSE 8160/tcp
EXPOSE 8160/udp

ENTRYPOINT ["java","-XX:MaxRAMPercentage=75.0","-jar","/opt/wvp/wvp.jar"]
