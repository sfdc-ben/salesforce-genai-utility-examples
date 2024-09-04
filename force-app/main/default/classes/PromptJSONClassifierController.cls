public class PromptJSONClassifierController {
  public class Response {
    @InvocableVariable
    public String Reason;
    @InvocableVariable
    public String Topic;
    @InvocableVariable
    public String Sentiment;
    @InvocableVariable
    public String Summary;
  }

  public class JSONObject {
    public string Reason;
    public string Topic;
    public string Sentiment;
    public string Summary;
  }

  public class Request {
    @InvocableVariable
    public String inputParam;
  }

  @InvocableMethod(
    label='Classify Prompt Response'
    description='Returns fields from classifcation'
  )
  public static list<Response> PromptJSONClassifierController(
    List<Request> requests
  ) {
    List<Response> responses = new List<Response>();
    for (Request req : requests) {
      Response res = new Response();
      JSONObject obj = (JSONobject) JSON.deserialize(
        req.inputParam,
        JSONObject.class
      );
      res.Reason = obj.Reason;
      res.Sentiment = obj.Sentiment;
      res.Topic = obj.Topic;
      res.Summary = obj.Summary;
      responses.add(res);
    }
    return responses;
  }
}
