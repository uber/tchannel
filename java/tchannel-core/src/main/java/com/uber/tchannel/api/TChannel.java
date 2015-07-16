package com.uber.tchannel.api;

import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;

public class TChannel {

    public final String channelName;

    public TChannel(String channelName) {
        this.channelName = channelName;
    }

    public FutureTask<Response> request(final Request request) {
        return new FutureTask<Response>(new Callable<Response>() {
            public Response call() throws Exception {
                System.out.println(request);
                return new Response();
            }
        });
    }

}
