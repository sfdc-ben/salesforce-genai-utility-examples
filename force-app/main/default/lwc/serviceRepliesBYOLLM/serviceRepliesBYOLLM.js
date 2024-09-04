import { LightningElement, wire, track, api } from 'lwc'
import { subscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService'
import ConversationEndUserChannel from '@salesforce/messageChannel/lightning__conversationEndUserMessage'
import ConversationAgentSendChannel from '@salesforce/messageChannel/lightning__conversationAgentSend'
import resolvePrompt from '@salesforce/apex/PromptResolutionTemplateController.resolvePrompt'

export default class ServiceRepliesBYOLLM extends LightningElement {
	// VARIABLES
	subscriptionUser = null
	subscriptionAgent = null

	@wire(MessageContext) messageContextUser
	@wire(MessageContext) messageContextAgent

	@track unansweredMessages = []
	@track showRefine = false
	@track refinement = ''
	@track generating = false
	@track generatedReply = {
		prompt: '',
		response: '',
		source: '',
		time: 0
	}

	@api recordId
	@api contextPromptId
	@api summaryPromptId
	@api refinementPromptId

	// GETTERS / SETTERS

	// LIFECYCLE FUNCTIONS
	connectedCallback() {
		this.subscribeToUserMessageChannel()
		this.subscribeToAgentMessageChannel()
	}

	// EVENT HANDLERS

	handleMessage(message) {
		this.unansweredMessages.push(message)
	}

	handleGenerateReply(event) {
		let templateInputs
		let inputsJSON
		let source = event.target.value
		let start = Date.now()
		templateInputs = [
			{ input: 'Messaging_Session', isObject: true, value: this.recordId },
			{ input: 'Content', isObject: false, value: this.unifyAnsweredMessages() }
		]
		inputsJSON = JSON.stringify(templateInputs)
		switch (source) {
			case 'Context':
				this.resolveReplyPrompt(this.contextPromptId, inputsJSON, source, start)
				break
			case 'Summary':
				this.resolveReplyPrompt(this.summaryPromptId, inputsJSON, source, start)
				break
			default:
				console.log('Nothing selected')
		}
	}
	handleShowRefine() {
		let currentShowRf = this.showRefine
		this.showRefine = !currentShowRf
	}

	handleRefinement(event) {
		this.refinement = event.target.value
	}

	handleRefinePrompt() {
		let templateInputs
		let inputsJSON
		templateInputs = [
			{ input: 'Prompt', isObject: false, value: this.generatedReply.prompt },
			{
				input: 'Response',
				isObject: false,
				value: this.generatedReply.response
			},
			{ input: 'Refinement', isObject: false, value: this.refinement }
		]
		inputsJSON = JSON.stringify(templateInputs)
		this.generating = true
		let start = Date.now()
		resolvePrompt({
			templateId: this.refinementPromptId,
			templateInputsJSON: inputsJSON
		})
			.then((data) => {
				let end = Date.now()
				this.generatedReply.response = data.response
				this.generatedReply.prompt = data.prompt
				this.generatedReply.time = (((end - start) % 60000) / 1000).toFixed(2)
				this.refinement = ''
				this.showRefine = false
				this.generating = false
			})
			.catch((error) => {
				console.log('error', error)
			})
	}

	async handleSetInput() {
		const toolKit = this.refs.lwcToolKitApi
		await toolKit.setAgentInput(this.recordId, { text: this.generatedReply.response })
	}

	async handleSendReply() {
		const toolKit = this.refs.lwcToolKitApi
		await toolKit.sendTextMessage(this.recordId, { text: this.generatedReply.response })
	}

	handleAgentMessage() {
		this.unansweredMessages = []
		this.generatedReply = {
			prompt: '',
			response: '',
			source: ''
		}
	}

	// HELPER FUNCTIONS
	subscribeToUserMessageChannel() {
		if (!this.subscriptionUser) {
			this.subscriptionUser = subscribe(this.messageContextUser, ConversationEndUserChannel, (message) => this.handleMessage(message), { scope: APPLICATION_SCOPE })
		}
	}
	subscribeToAgentMessageChannel() {
		if (!this.subscriptionAgent) {
			this.subscriptionAgent = subscribe(this.messageContextAgent, ConversationAgentSendChannel, () => this.handleAgentMessage(), { scope: APPLICATION_SCOPE })
		}
	}

	resolveReplyPrompt(template, input, source, start) {
		this.generating = true
		resolvePrompt({ templateId: template, templateInputsJSON: input })
			.then((data) => {
				let end = Date.now()
				this.generatedReply = {
					prompt: data.prompt,
					response: data.response,
					source: source,
					time: (((end - start) % 60000) / 1000).toFixed(2)
				}
				this.generating = false
			})
			.catch((error) => {
				console.log('error', error)
			})
	}

	unifyAnsweredMessages() {
		let unifiedMsgs = ''
		if (this.unansweredMessages.length === 0) {
			unifiedMsgs = '(blank)'
		} else {
			this.unansweredMessages.forEach((msg) => {
				const regex = /[!.?](?:\s+)?$(?<=)/gm
				let lastDigit = msg.content.charAt(msg.length - 1)
				if (!regex.test(lastDigit)) {
					msg.content += '. '
				}
				unifiedMsgs += msg.content
			})
		}
		return unifiedMsgs
	}
}
